// The Point tool (spec §12.3): click a part surface to add an ephemeral point there. A selected point
// gets a gizmo in its host's axes (G / R switch it between move and rotate, Ctrl snaps), Enter or its
// "+" handle mounts a part on it, and Delete removes it, asking first when a part hangs from it.
import { signal } from '@preact/signals';
import { Matrix4, Quaternion, Vector3, type Vector2 } from 'three';
import type { Catalog } from '../core/catalog-types';
import { cfToMatrix4, matrix4ToCf, roundCf } from '../core/cframe';
import { frameFromNormal } from '../core/frames';
import { graphIndex, poseDescendants } from '../core/graph';
import { addPoint, deletePoint, setPointCFrame } from '../core/ops/points';
import { subPartMatrix, type Poses } from '../core/pose';
import type { CFrame12, Doc, PartId, PointKey, Uuid } from '../core/types';
import { posesSig } from '../state/derived';
import { pointKey, select, selectionSig, selectPoints } from '../state/selection';
import { catalogSig, commit, docSig } from '../state/store';
import { getViewport } from '../viewport/context';
import { pickPart, pickPoint } from '../viewport/raycast';
import { closePicker, openPicker } from './connect';
import type { Tool, ToolPointer } from './manager';
import { createSelectTool } from './select';
import { deltaMatrix, previewMoving, transformStateSig, type TransformDelta } from './transform';

/** A surface normal this close to a host axis snaps onto it (spec §12.3). */
const SNAP_RAD = (10 * Math.PI) / 180;
const AXES = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];

export const pointGizmoModeSig = signal<'translate' | 'rotate'>('translate');
/** A delete waiting for the user's choice, because parts hang from the point. */
export const pointDeleteSig = signal<{ host: PartId; uuid: Uuid; children: PartId[] } | null>(
  null,
);

/**
 * The host-local frame of a new point at a surface hit: +Y along the normal (snapped onto a host axis
 * within 10°), roll along the host's axes, rounded like other stored frames.
 */
export function surfacePointFrame(
  hostWorld: Matrix4,
  sub: Matrix4,
  point: Vector3,
  normal: Vector3,
): CFrame12 {
  const toLocal = hostWorld.clone().multiply(sub).invert();
  const p = point.clone().applyMatrix4(toLocal);
  const n = normal.clone().transformDirection(toLocal);
  const axis = AXES.find((a) => n.angleTo(a) < SNAP_RAD);
  if (axis) n.copy(axis);
  return roundCf(frameFromNormal(p.toArray(), n.toArray()), 4, 6);
}

const splitKey = (key: PointKey): { host: PartId; uuid: Uuid } => {
  const at = key.indexOf(':');
  return { host: Number(key.slice(0, at)), uuid: key.slice(at + 1) };
};

/** The one selected point, when exactly one point (and no part) is selected. */
export function selectedPoint(): { host: PartId; uuid: Uuid } | null {
  const sel = selectionSig.value;
  if (sel.points.size !== 1 || sel.parts.size > 0) return null;
  return splitKey([...sel.points][0]);
}

/** World frame of a point: host world · sub-part · point cframe. */
function pointWorld(
  doc: Doc,
  poses: Poses,
  cat: Catalog,
  host: PartId,
  uuid: Uuid,
): Matrix4 | null {
  const part = doc.parts.get(host);
  const point = part?.points?.get(uuid);
  const world = poses.world.get(host);
  if (!part || !point || !world) return null;
  return world
    .clone()
    .multiply(subPartMatrix(cat, part.type, point.partName, part.props).m)
    .multiply(cfToMatrix4(point.cframe));
}

/** The parts hanging from a point. */
const childrenOf = (doc: Doc, host: PartId, uuid: Uuid): PartId[] => [
  ...new Set((graphIndex(doc).pointUsers.get(`${host}:${uuid}`) ?? []).map((r) => r.child)),
];

/** Where the gizmo sits for the selected point: its origin, turned to its host's axes (spec §12.3). */
export function pointGizmoPlacement(): { position: Vector3; quaternion: Quaternion } | null {
  const sel = selectedPoint();
  const cat = catalogSig.value;
  if (!sel || !cat) return null;
  const doc = docSig.value;
  const poses = posesSig.value;
  const m = pointWorld(doc, poses, cat, sel.host, sel.uuid);
  const host = doc.parts.get(sel.host)!;
  if (!m) return null;
  const quaternion = new Quaternion();
  poses.world
    .get(sel.host)!
    .clone()
    .multiply(subPartMatrix(cat, host.type, host.points!.get(sel.uuid)!.partName, host.props).m)
    .decompose(new Vector3(), quaternion, new Vector3());
  return { position: new Vector3().setFromMatrixPosition(m), quaternion };
}

interface PointDrag {
  readonly host: PartId;
  readonly uuid: Uuid;
  readonly world: Matrix4;
  readonly poses: Poses;
  /** The parts hanging from the point and everything posed off them. */
  readonly moving: ReadonlyMap<PartId, PartId>;
}

let drag: PointDrag | null = null;

const originDelta = (d: PointDrag, delta: TransformDelta) =>
  deltaMatrix(delta, new Vector3().setFromMatrixPosition(d.world));

/** What the viewport gizmo calls while it moves or turns the selected point. */
export const pointGizmoHandlers = {
  start(): void {
    const sel = selectedPoint();
    const cat = catalogSig.value;
    const doc = docSig.value;
    const poses = posesSig.value;
    const world = sel && cat && pointWorld(doc, poses, cat, sel.host, sel.uuid);
    if (!sel || !world) return;
    const moving = new Map<PartId, PartId>();
    for (const child of childrenOf(doc, sel.host, sel.uuid)) {
      moving.set(child, child);
      for (const below of poseDescendants(doc, child)) moving.set(below, child);
    }
    drag = { ...sel, world, poses, moving };
    transformStateSig.value = 'transform';
  },
  change(delta: TransformDelta): void {
    if (drag) previewMoving(drag.moving, drag.poses, () => originDelta(drag!, delta));
  },
  end(delta: TransformDelta): void {
    const d = drag;
    drag = null;
    transformStateSig.value = 'idle';
    if (!d) return;
    const cat = catalogSig.value;
    const host = docSig.value.parts.get(d.host);
    const point = host?.points?.get(d.uuid);
    if (!cat || !host || !point) return previewMoving(d.moving, d.poses, () => new Matrix4());
    const hostFrame = d.poses.world
      .get(d.host)!
      .clone()
      .multiply(subPartMatrix(cat, host.type, point.partName, host.props).m);
    const moved = originDelta(d, delta).multiply(d.world);
    const cf = roundCf(matrix4ToCf(hostFrame.invert().multiply(moved)), 4, 6);
    const patch = commit('Move point', (draft) => setPointCFrame(draft, d.host, d.uuid, cf));
    if (patch === null) previewMoving(d.moving, d.poses, () => new Matrix4());
  },
  cancel(): void {
    const d = drag;
    drag = null;
    transformStateSig.value = 'idle';
    if (d) previewMoving(d.moving, d.poses, () => new Matrix4());
  },
};

/** Adds a point on the part surface under `ndc` and selects it. */
function addPointAt(ndc: Vector2): void {
  const cat = catalogSig.value;
  const hit = pickPart(ndc);
  if (!cat || !hit) {
    select([], 'replace');
    return;
  }
  const doc = docSig.value;
  const host = doc.parts.get(hit.part)!;
  const sub = subPartMatrix(cat, host.type, hit.subPart, host.props).m;
  const cf = surfacePointFrame(posesSig.value.world.get(host.id)!, sub, hit.point, hit.normal);
  let uuid: Uuid = '';
  commit('Add point', (d) => {
    uuid = addPoint(d, host.id, cf, hit.subPart);
  });
  selectPoints([pointKey(host.id, uuid)], 'replace');
}

/** Deletes a point at once, or asks first when parts hang from it. */
export function requestPointDelete(host: PartId, uuid: Uuid): void {
  const children = childrenOf(docSig.value, host, uuid);
  if (children.length > 0) {
    pointDeleteSig.value = { host, uuid, children };
    return;
  }
  commit('Delete point', (d) => deletePoint(d, host, uuid, 'detach', posesSig.value));
}

/** Carries out a delete the user confirmed: detach the hanging parts, or delete them too. */
export function confirmPointDelete(policy: 'detach' | 'delete'): void {
  const req = pointDeleteSig.value;
  pointDeleteSig.value = null;
  if (!req) return;
  commit(policy === 'delete' ? 'Delete point and parts' : 'Delete point', (d) =>
    deletePoint(d, req.host, req.uuid, policy, posesSig.value),
  );
}

/** Opens the part picker to mount a part on the selected free point. */
function mountOnSelected(at?: { x: number; y: number }): boolean {
  const sel = selectedPoint();
  const vp = getViewport();
  if (!sel || !vp || childrenOf(docSig.value, sel.host, sel.uuid).length > 0) return false;
  const r = vp.canvas.getBoundingClientRect();
  openPicker(at ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 }, [
    { kind: 'point', host: sel.host, uuid: sel.uuid },
  ]);
  return true;
}

const DRAG_PX = 4;

export function createPointTool(): Tool {
  const inner = createSelectTool();
  let press: { x: number; y: number } | null = null;
  let gizmoPress = false;
  let plus: HTMLButtonElement | null = null;

  /** The "+" handle on a selected free point, kept on the point after every frame. */
  const placePlus = () => {
    const vp = getViewport();
    const cat = catalogSig.value;
    const sel = selectedPoint();
    const free = sel && childrenOf(docSig.value, sel.host, sel.uuid).length === 0;
    const m = free && cat ? pointWorld(docSig.value, posesSig.value, cat, sel!.host, sel!.uuid) : null;
    if (!vp || !m) {
      plus?.remove();
      plus = null;
      return;
    }
    const host = vp.canvas.parentElement!;
    if (!plus) {
      plus = document.createElement('button');
      plus.className = 'point-plus';
      plus.textContent = '+';
      plus.title = 'Mount a part on this point (Enter)';
      plus.setAttribute('aria-label', 'Mount a part on this point');
      plus.addEventListener('click', (e) => {
        mountOnSelected({ x: e.clientX, y: e.clientY });
      });
      host.append(plus);
    }
    const v = new Vector3().setFromMatrixPosition(m).project(vp.rig.camera);
    const r = vp.canvas.getBoundingClientRect();
    plus.style.left = `${((v.x + 1) / 2) * r.width + 10}px`;
    plus.style.top = `${((1 - v.y) / 2) * r.height - 26}px`;
    plus.hidden = v.z > 1;
  };

  return {
    id: 'point',
    activate() {
      getViewport()?.afterRender.add(placePlus);
      getViewport()?.request();
    },
    deactivate() {
      getViewport()?.afterRender.delete(placePlus);
      plus?.remove();
      plus = null;
      press = null;
      gizmoPress = false;
      inner.deactivate();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) return inner.onPointer!(e);
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        closePicker();
        if (getViewport()?.gizmo?.busy()) gizmoPress = true;
        else press = { x: e.x, y: e.y };
        return;
      }
      if (gizmoPress) {
        if (e.kind === 'up') gizmoPress = false;
        return;
      }
      if (e.kind !== 'up' || !press) return;
      const moved = Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX;
      press = null;
      if (moved) return;
      const p = pickPoint(e.ndc);
      if (p) selectPoints([pointKey(p.host, p.uuid)], e.shift ? 'toggle' : 'replace');
      else addPointAt(e.ndc);
    },
    onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      const sel = selectedPoint();
      if (e.key === 'Enter') return mountOnSelected();
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        requestPointDelete(sel.host, sel.uuid);
        return true;
      }
      if (sel && (e.code === 'KeyG' || e.code === 'KeyR')) {
        pointGizmoModeSig.value = e.code === 'KeyG' ? 'translate' : 'rotate';
        return true;
      }
      return (inner.onKey?.(e) ?? false);
    },
  };
}
