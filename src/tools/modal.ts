// Modal transforms (spec §12.4), in both camera schemes: G moves and R rotates the selection (parts,
// or one ephemeral point) with the mouse; in the Surface tool G moves the chosen corners. X/Y/Z constrain to a world axis (press again for the active part's local axis, again to clear);
// with no axis a move follows the mouse in the view plane and a rotation turns about the view axis.
// Typed numbers set the amount, holding Ctrl snaps to the snap steps (moves onto the world grid, on
// every axis, while World grid is on), Enter or a left click confirms,
// Esc or a right click cancels. No Ctrl shortcuts: browsers reserve too many of them. While it runs the
// transform gizmo hides, and a chosen axis is drawn through the pivot in its colour, as in Blender.
import { signal } from '@preact/signals';
import { Euler, MathUtils, Plane, Quaternion, Ray, Vector2, Vector3 } from 'three';
import { selectionSig } from '../state/selection';
import { catalogSig, docSig } from '../state/store';
import { settingsSig } from '../state/settings';
import {
  editingReferencePlaneSig,
  referencePlanesSig,
  updateReferencePlane,
} from '../state/references';
import { inspectorTabSig } from '../state/ui';
import { getViewport } from '../viewport/context';
import { toolSig } from './manager';
import { pointGizmoHandlers, pointGizmoPlacement, selectedPoint } from './point';
import { hasSurfaceControlSelection, surfaceGestureToken, surfaceGizmoHandlers, surfaceGizmoPlacement } from './surface';
import {
  beginSession,
  cancelSession,
  finishSession,
  gridOffset,
  pivotModeSig,
  pivotOf,
  previewSession,
  selectionFrame,
  snapValue,
  transformStateSig,
  type Axis,
  type TransformDelta,
} from './transform';

const AXES: Readonly<Record<Axis, Vector3>> = {
  X: new Vector3(1, 0, 0),
  Y: new Vector3(0, 1, 0),
  Z: new Vector3(0, 0, 1),
};

/** What a modal transforms: the selected parts (a transform session) or the one selected point. */
interface Target {
  alive?(): boolean;
  readonly pivot: Vector3;
  /** The active part's orientation (a point's: its host's), for local axes. */
  readonly local: Quaternion;
  preview(d: TransformDelta): void;
  finish(d: TransformDelta): void;
  cancel(): void;
}

/** Reference planes use the same mouse/axis/numeric transform engine, outside blueprint history. */
function referenceTarget(): Target | null {
  const id = editingReferencePlaneSig.peek(),
    before = id === null ? null : referencePlanesSig.peek().get(id);
  if (id === null || !before?.visible || inspectorTabSig.peek() !== 'reference') return null;
  const pivot = new Vector3(...before.position),
    local = new Quaternion().setFromEuler(
      new Euler(...(before.rotation.map(MathUtils.degToRad) as [number, number, number])),
    );
  const apply = (d: TransformDelta) => {
    if (d.kind === 'move') {
      const offset = d.grid ? gridOffset(d.offset, pivot, d.grid) : d.offset;
      updateReferencePlane(id, { position: pivot.clone().add(offset).toArray() });
    } else {
      const e = new Euler().setFromQuaternion(d.rotation.clone().multiply(local));
      updateReferencePlane(id, {
        rotation: [e.x, e.y, e.z].map(MathUtils.radToDeg) as [number, number, number],
      });
    }
  };
  return {
    pivot,
    local,
    alive: () =>
      inspectorTabSig.peek() === 'reference' &&
      editingReferencePlaneSig.peek() === id &&
      !!referencePlanesSig.peek().get(id)?.visible,
    preview: apply,
    finish: apply,
    cancel: () =>
      updateReferencePlane(id, { position: before.position, rotation: before.rotation }),
  };
}

function partsTarget(): Target | null {
  const session = beginSession();
  if (!session) return null;
  const sel = selectionSig.value;
  const ids = [...sel.parts].filter((id) => session.poses.world.has(id));
  const active = typeof sel.active === 'number' && sel.parts.has(sel.active) ? sel.active : null;
  // A selected piece (D25) turns about, and along, its own body.
  const { originOf, worldOf } = selectionFrame(docSig.value, session.poses, sel, catalogSig.value);
  const local = new Quaternion();
  worldOf(active ?? ids[ids.length - 1])!.decompose(new Vector3(), local, new Vector3());
  return {
    pivot: pivotOf(session.poses, ids, pivotModeSig.value, active, originOf),
    local,
    alive: () => [...session.selection.parts].some((id) => docSig.peek().parts.has(id)),
    preview: (d) => previewSession(session, d),
    finish: (d) => finishSession(session, d),
    cancel: () => cancelSession(session),
  };
}

function pointTarget(): Target | null {
  const at = pointGizmoPlacement();
  const point = selectedPoint();
  if (!at) return null;
  pointGizmoHandlers.start();
  return {
    pivot: at.position,
    local: at.quaternion,
    alive: () => !!point && !!docSig.peek().parts.get(point.host)?.points?.has(point.uuid),
    preview: (d) => pointGizmoHandlers.change(d),
    finish: (d) => pointGizmoHandlers.end(d),
    cancel: () => pointGizmoHandlers.cancel(),
  };
}

function cornerTarget(): Target | null {
  const at = surfaceGizmoPlacement();
  if (!at) return null;
  surfaceGizmoHandlers.start();
  const token = surfaceGestureToken();
  return {
    pivot: at.position,
    local: at.quaternion,
    alive: () => token !== null && surfaceGestureToken() === token,
    preview: (d) => surfaceGizmoHandlers.change(d),
    finish: (d) => surfaceGizmoHandlers.end(d),
    cancel: () => surfaceGizmoHandlers.cancel(),
  };
}

interface Modal {
  readonly kind: 'move' | 'rotate';
  readonly target: Target;
  readonly pivot: Vector3;
  readonly local: Quaternion;
  /** Client pixels where the transform started. */
  readonly start: { readonly x: number; readonly y: number };
  readonly hint: HTMLElement;
  mouse: { x: number; y: number };
  ctrl: boolean;
  axis: Axis | null;
  space: 'world' | 'local';
  typed: string;
  last: TransformDelta;
}

let modal: Modal | null = null;

/** True while a modal move or rotate runs; the viewport hides the transform gizmo meanwhile. */
export const modalActiveSig = signal(false);
/** The constrained axis through the pivot, for the viewport to draw; null when none is chosen. */
export const modalGuideSig = signal<{
  readonly origin: Vector3;
  readonly dir: Vector3;
  readonly axis: Axis;
} | null>(null);

export function modalActive(): boolean {
  return modal !== null;
}

const axisVector = (m: Modal): Vector3 | null =>
  m.axis === null
    ? null
    : m.space === 'local'
      ? AXES[m.axis].clone().applyQuaternion(m.local)
      : AXES[m.axis].clone();

function typedValue(m: Modal): number | null {
  const v = Number(m.typed);
  return m.typed === '' || m.typed === '-' || !Number.isFinite(v) ? null : v;
}

/** Snapping is on while Ctrl (Cmd on a Mac) is held. */
const snapping = (m: Modal) => m.ctrl;
/** Snapped moves land on the world grid, on every axis, while World grid is on. */
const onGrid = () => settingsSig.value.snapToGrid;

/** A world point's position in client pixels. */
function screenOf(p: Vector3): Vector2 {
  const vp = getViewport()!;
  const v = p.clone().project(vp.rig.camera);
  const r = vp.canvas.getBoundingClientRect();
  return new Vector2(r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height);
}

/** The point under a client position on the camera-facing plane through `through`. */
function planePoint(at: { x: number; y: number }, through: Vector3): Vector3 | null {
  const vp = getViewport()!;
  const camera = vp.rig.camera;
  const ndc = vp.ndc({ clientX: at.x, clientY: at.y });
  const near = new Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const far = new Vector3(ndc.x, ndc.y, 1).unproject(camera);
  const ray = new Ray(near, far.sub(near).normalize());
  const plane = new Plane().setFromNormalAndCoplanarPoint(
    camera.getWorldDirection(new Vector3()),
    through,
  );
  return ray.intersectPlane(plane, new Vector3());
}

function moveDelta(m: Modal): TransformDelta {
  const axis = axisVector(m);
  const typed = typedValue(m);
  const step = settingsSig.value.snapMove;
  // Typing without a constraint moves along X, as in Blender.
  if (typed !== null)
    return { kind: 'move', offset: (axis ?? AXES.X.clone()).multiplyScalar(typed) };
  let offset = new Vector3();
  if (axis) {
    // Mouse travel along the axis as drawn on screen, converted back to studs.
    const along = screenOf(m.pivot.clone().add(axis)).sub(screenOf(m.pivot));
    const len2 = along.lengthSq();
    if (len2 > 1e-6) {
      const t = ((m.mouse.x - m.start.x) * along.x + (m.mouse.y - m.start.y) * along.y) / len2;
      if (snapping(m) && onGrid()) offset = gridOffset(axis.multiplyScalar(t), m.pivot, step);
      else offset = axis.clone().multiplyScalar(snapping(m) ? snapValue(t, step) : t);
    }
  } else {
    const a = planePoint(m.start, m.pivot);
    const b = planePoint(m.mouse, m.pivot);
    if (a && b) offset = b.sub(a);
    if (snapping(m) && onGrid()) offset = gridOffset(offset, m.pivot, step);
    else if (snapping(m)) {
      offset.set(snapValue(offset.x, step), snapValue(offset.y, step), snapValue(offset.z, step));
    }
  }
  return snapping(m) && onGrid() ? { kind: 'move', offset, grid: step } : { kind: 'move', offset };
}

/** The rotation axis and angle: typed degrees, or the mouse's turn around the pivot on screen. */
function rotation(m: Modal): { axis: Vector3; degrees: number } {
  const toViewer = getViewport()!.rig.camera.getWorldDirection(new Vector3()).negate();
  const axis = axisVector(m) ?? toViewer.clone();
  const typed = typedValue(m);
  if (typed !== null) return { axis, degrees: typed };
  // Counter-clockwise on screen is positive (y up), wrapped to [-180, 180).
  const c = screenOf(m.pivot);
  const from = Math.atan2(c.y - m.start.y, m.start.x - c.x);
  const to = Math.atan2(c.y - m.mouse.y, m.mouse.x - c.x);
  const turn = ((((MathUtils.radToDeg(to - from) + 180) % 360) + 360) % 360) - 180;
  // Seen from the side the axis points away to, the same screen turn is the opposite rotation.
  const degrees = axis.dot(toViewer) < 0 ? -turn : turn;
  return {
    axis,
    degrees: snapping(m) ? snapValue(degrees, settingsSig.value.snapRotate) : degrees,
  };
}

function rotateDelta(m: Modal): TransformDelta {
  const { axis, degrees } = rotation(m);
  return {
    kind: 'rotate',
    rotation: new Quaternion().setFromAxisAngle(axis.normalize(), MathUtils.degToRad(degrees)),
    pivot: pivotModeSig.value === 'individual' ? 'individual' : m.pivot.clone(),
  };
}

function hintText(m: Modal, d: TransformDelta): string {
  const space = m.space === 'local' ? ' (local)' : '';
  const { snapMove, snapRotate } = settingsSig.value;
  const step =
    d.kind === 'move' ? `${snapMove} studs${onGrid() ? ', world grid' : ''}` : `${snapRotate}°`;
  const snap = m.ctrl ? 'snapping' : `hold Ctrl to snap (${step})`;
  const keys = `X/Y/Z axis · type a number · ${snap} · Enter confirms · Esc cancels`;
  if (d.kind === 'move') {
    const amount =
      m.typed ||
      d.offset
        .toArray()
        .map((v) => v.toFixed(3))
        .join(', ');
    return `Move${m.axis ? ` along ${m.axis}${space}` : ''}: ${amount} · ${keys}`;
  }
  const about = m.axis ? `${m.axis}${space}` : 'the view axis';
  return `Rotate about ${about}: ${m.typed || rotation(m).degrees.toFixed(1)}° · ${keys}`;
}

function update(m: Modal): void {
  m.last = m.kind === 'move' ? moveDelta(m) : rotateDelta(m);
  m.target.preview(m.last);
  m.hint.textContent = hintText(m, m.last);
}

function end(confirm: boolean): void {
  const m = modal;
  if (!m) return;
  modal = null;
  window.removeEventListener('pointermove', onMove, true);
  window.removeEventListener('pointerdown', onDown, true);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKeyUp, true);
  window.removeEventListener('contextmenu', onContextMenu, true);
  m.hint.remove();
  modalGuideSig.value = null;
  modalActiveSig.value = false;
  if (confirm) m.target.finish(m.last);
  else m.target.cancel();
}

function onMove(e: PointerEvent): void {
  if (!modal) return;
  modal.mouse = { x: e.clientX, y: e.clientY };
  modal.ctrl = e.ctrlKey || e.metaKey;
  update(modal);
}

function onDown(e: PointerEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.button === 0) end(true);
  else if (e.button === 2) end(false);
}

function onContextMenu(e: Event): void {
  e.preventDefault();
}

function onKey(e: KeyboardEvent): void {
  const m = modal;
  if (!m) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (e.key === 'Escape') end(false);
  else if (e.key === 'Enter') end(true);
  else if (plain && (e.code === 'KeyX' || e.code === 'KeyY' || e.code === 'KeyZ')) {
    const axis = e.code.slice(3) as Axis;
    // world → local → none, as in Blender.
    if (m.axis !== axis) [m.axis, m.space] = [axis, 'world'];
    else if (m.space === 'world') m.space = 'local';
    else m.axis = null;
    const dir = axisVector(m);
    modalGuideSig.value = dir && m.axis ? { origin: m.pivot.clone(), dir, axis: m.axis } : null;
    update(m);
  } else if (plain && /^[0-9.]$/.test(e.key)) {
    m.typed += e.key;
    update(m);
  } else if (plain && e.key === '-') {
    m.typed = m.typed.startsWith('-') ? m.typed.slice(1) : `-${m.typed}`;
    update(m);
  } else if (e.key === 'Backspace') {
    m.typed = m.typed.slice(0, -1);
    update(m);
  } else if (e.key === 'Control' || e.key === 'Meta') {
    m.ctrl = true;
    update(m);
    return;
  } else return;
  e.preventDefault();
  e.stopPropagation();
}

function onKeyUp(e: KeyboardEvent): void {
  if (modal && (e.key === 'Control' || e.key === 'Meta')) {
    modal.ctrl = false;
    update(modal);
  }
}

/** Starts a modal move or rotate of the selection; false when there is nothing to transform. */
export function startModal(kind: 'move' | 'rotate'): boolean {
  if (modal) return true;
  const vp = getViewport();
  if (!vp || transformStateSig.value !== 'idle') return false;
  // In the Surface tool the chosen corners are what G moves; corners do not turn.
  const corner = toolSig.value === 'surface' && hasSurfaceControlSelection();
  const target =
    referenceTarget() ??
    (corner
      ? kind === 'move'
        ? cornerTarget()
        : null
      : selectionSig.value.parts.size > 0
        ? partsTarget()
        : pointTarget());
  if (!target) return false;
  const r = vp.canvas.getBoundingClientRect();
  const start = vp.pointer ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const hint = document.createElement('div');
  hint.className = 'modal-hint';
  vp.canvas.parentElement!.append(hint);
  modal = {
    kind,
    target,
    pivot: target.pivot,
    local: target.local,
    start,
    hint,
    mouse: { ...start },
    ctrl: false,
    axis: null,
    space: 'world',
    typed: '',
    last: { kind: 'move', offset: new Vector3() },
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  modalActiveSig.value = true;
  update(modal);
  return true;
}

/** Ends a modal transform without committing (tool switch, viewport teardown). */
export function cancelModal(): void {
  end(false);
}
/** A shared update redraws authoritative instances; reapply the active local gesture afterwards. */
export function refreshModal(): void {
  if (!modal) return;
  if (modal.target.alive && !modal.target.alive()) end(false);
  else update(modal);
}
