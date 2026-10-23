// Transform tools (spec §12.4, §9.3): the Move and Rotate tools, gizmo drags and drag re-attach, plus
// the pure helpers and the preview session they share with the modal G/R (modal.ts).
import { signal } from '@preact/signals';
import { Matrix4, Plane, Quaternion, Ray, Vector3, type Vector2 } from 'three';
import { cfToMatrix4 } from '../core/cframe';
import type { Catalog, Conventions } from '../core/catalog-types';
import { childWorldViaPoint, childWorldViaSocket } from '../core/conventions';
import { defaultChildSocket } from '../core/defaults';
import { frameFromNormal } from '../core/frames';
import { poseDescendants } from '../core/graph';
import {
  chooseMountSocket,
  makeFreeMovable,
  retargetCheckDoc,
  retargetPose,
  setWorldPose,
  topmost,
  type PoseTarget,
} from '../core/ops/move';
import type { Draft } from '../core/ops/transact';
import { poseConn, socketMatrix, type Poses } from '../core/pose';
import { canBeChild, canBeParent } from '../core/rules';
import type { Doc, PartId, Verdict } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig, hoverSig, select, selectionSig, type Selection } from '../state/selection';
import { catalogSig, commit, docSig } from '../state/store';
import { toast } from '../state/toasts';
import { loadPref, savePref } from '../storage/prefs';
import { getViewport } from '../viewport/context';
import { pickPart, pickSocket } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';
import { clickOp, createSelectTool } from './select';

export type PivotMode = 'median' | 'active' | 'individual';
export type Axis = 'X' | 'Y' | 'Z';
export type Space = 'world' | 'local';
/** A world-space transform: a move, or a rotation about a pivot (or about each part's own origin). */
export type TransformDelta =
  | { kind: 'move'; offset: Vector3 }
  | { kind: 'rotate'; rotation: Quaternion; pivot: Vector3 | 'individual' };

const PIVOTS: readonly PivotMode[] = ['median', 'active', 'individual'];
const SPACES: readonly Space[] = ['world', 'local'];
const stored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const v = loadPref<unknown>(key, fallback);
  return allowed.includes(v as T) ? (v as T) : fallback;
};

export const pivotModeSig = signal<PivotMode>(stored('pivotMode', PIVOTS, 'median'));
export const spaceSig = signal<Space>(stored('transformSpace', SPACES, 'world'));
/** What is in progress: nothing, a gizmo or modal transform, or a drag re-attach. */
export const transformStateSig = signal<'idle' | 'transform' | 'reattach'>('idle');

export function setPivotMode(mode: PivotMode): void {
  pivotModeSig.value = mode;
  savePref('pivotMode', mode);
}

export function setSpace(space: Space): void {
  spaceSig.value = space;
  savePref('transformSpace', space);
}

const positionOf = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);
const translation = (v: Vector3) => new Matrix4().makeTranslation(v.x, v.y, v.z);

/** The transform pivot: the active part's origin, or the mean of the origins (also for individual). */
export function pivotOf(
  poses: Poses,
  ids: readonly PartId[],
  mode: PivotMode,
  active: PartId | null,
): Vector3 {
  const own = mode === 'active' && active !== null ? poses.world.get(active) : undefined;
  if (own) return positionOf(own);
  const sum = new Vector3();
  let n = 0;
  for (const id of ids) {
    const m = poses.world.get(id);
    if (!m) continue;
    sum.add(positionOf(m));
    n++;
  }
  return n > 0 ? sum.divideScalar(n) : sum;
}

/** Rounds half away from zero to a multiple of `step` (no float noise, no -0); `step <= 0` keeps `v`. */
export function snapValue(v: number, step: number): number {
  if (!(step > 0)) return v;
  const n = Math.round(Math.abs(v) / step);
  return Number((Math.sign(v) * n * step).toFixed(10)) + 0;
}

/** Keeps only the component along a world axis; null keeps all three. */
export function constrainDelta(delta: Vector3, axis: Axis | null): Vector3 {
  if (axis === null) return delta.clone();
  const out = new Vector3();
  const k = axis === 'X' ? 'x' : axis === 'Y' ? 'y' : 'z';
  out[k] = delta[k];
  return out;
}

/** The world matrix a delta applies (on the left) to a part whose origin is `origin`. */
export function deltaMatrix(delta: TransformDelta, origin: Vector3): Matrix4 {
  if (delta.kind === 'move') return translation(delta.offset);
  const c = delta.pivot === 'individual' ? origin : delta.pivot;
  return translation(c)
    .multiply(new Matrix4().makeRotationFromQuaternion(delta.rotation))
    .multiply(translation(c.clone().negate()));
}

/**
 * Moves each of `ids` (topmost parts: none carries another) to `deltaOf(id) · world`, freeing socket
 * joints as spec §9.3 says; descendants follow. Returns the reasons of the parts that cannot move.
 */
export function applyTransform(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  ids: readonly PartId[],
  deltaOf: (id: PartId) => Matrix4,
): string[] {
  const refused: string[] = [];
  for (const id of ids) {
    const world = poses.world.get(id);
    if (!world) continue;
    const free = makeFreeMovable(d, cat, conv, poses, id);
    if (!free.ok) {
      refused.push(free.reason);
      continue;
    }
    setWorldPose(d, cat, conv, poses, id, deltaOf(id).clone().multiply(world));
  }
  return refused;
}

/** Where the gizmo sits for a selection: the pivot, turned to the active part in local space. */
export function gizmoPlacement(
  doc: Doc,
  poses: Poses,
  sel: Selection,
  mode: PivotMode,
  space: Space,
): { position: Vector3; quaternion: Quaternion } | null {
  const ids = [...sel.parts].filter((id) => doc.parts.has(id) && poses.world.has(id));
  if (ids.length === 0) return null;
  const active = typeof sel.active === 'number' && sel.parts.has(sel.active) ? sel.active : null;
  const quaternion = new Quaternion();
  if (space === 'local') {
    poses.world.get(active ?? ids[ids.length - 1])!.decompose(new Vector3(), quaternion, new Vector3());
  }
  return { position: pivotOf(poses, ids, mode, active), quaternion };
}

const plural = (verb: string, n: number) => `${verb} ${n} ${n === 1 ? 'part' : 'parts'}`;

/** A transform in progress over the selection's topmost parts; the doc changes only at `finish`. */
export interface Session {
  readonly ids: readonly PartId[];
  /** Every part that moves (topmost parts and their pose descendants), mapped to its topmost part. */
  readonly moving: ReadonlyMap<PartId, PartId>;
  readonly poses: Poses;
}

/** Starts a transform of the selection; null when nothing is selected or the library is not loaded. */
export function beginSession(): Session | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const sel = [...selectionSig.value.parts].filter((id) => poses.world.has(id));
  if (sel.length === 0 || catalogSig.value === null) return null;
  const ids = topmost(doc, sel);
  const moving = new Map<PartId, PartId>();
  for (const id of ids) {
    moving.set(id, id);
    for (const below of poseDescendants(doc, id)) moving.set(below, id);
  }
  transformStateSig.value = 'transform';
  return { ids, moving, poses };
}

/** Draws the moving parts at `deltaOf(topmost) · world` without changing the doc. */
function previewMoving(
  moving: ReadonlyMap<PartId, PartId>,
  poses: Poses,
  deltaOf: (top: PartId) => Matrix4,
): void {
  const vp = getViewport();
  if (!vp?.layer) return;
  const hidden = hiddenSig.peek();
  const out = new Map<PartId, Matrix4>();
  const deltas = new Map<PartId, Matrix4>();
  for (const [id, top] of moving) {
    const world = poses.world.get(id);
    if (!world || hidden.has(id)) continue;
    let delta = deltas.get(top);
    if (!delta) deltas.set(top, (delta = deltaOf(top)));
    out.set(id, delta.clone().multiply(world));
  }
  vp.layer.setPreview(out);
  vp.request();
}

const originDelta = (s: { poses: Poses }, delta: TransformDelta) => (top: PartId) =>
  deltaMatrix(delta, positionOf(s.poses.world.get(top)!));

export function previewSession(s: Session, delta: TransformDelta): void {
  previewMoving(s.moving, s.poses, originDelta(s, delta));
}

/** Puts the moving parts back where the doc has them. */
export function cancelSession(s: Session): void {
  previewMoving(s.moving, s.poses, () => new Matrix4());
  transformStateSig.value = 'idle';
}

/** Commits the transform as one history entry; refused parts stay and are listed in a toast. */
export function finishSession(s: Session, delta: TransformDelta): void {
  const cat = catalogSig.value;
  transformStateSig.value = 'idle';
  if (!cat) return cancelSession(s);
  let refused: string[] = [];
  const patch = commit(plural(delta.kind === 'move' ? 'Move' : 'Rotate', s.ids.length), (d) => {
    refused = applyTransform(d, cat, cat.conventions, s.poses, s.ids, originDelta(s, delta));
  });
  if (patch === null) cancelSession(s);
  if (refused.length > 0) toast(refused.join('\n'), 'warn');
}

let gizmoSession: Session | null = null;

/** What the viewport gizmo calls as a drag starts, moves, ends or is cancelled (Esc). */
export const gizmoHandlers = {
  start(): void {
    gizmoSession = beginSession();
  },
  change(delta: TransformDelta): void {
    if (gizmoSession) previewSession(gizmoSession, delta);
  },
  end(delta: TransformDelta): void {
    const s = gizmoSession;
    gizmoSession = null;
    if (s) finishSession(s, delta);
  },
  cancel(): void {
    const s = gizmoSession;
    gizmoSession = null;
    if (s) cancelSession(s);
  },
};

/** Movement past this many pixels turns a press on a part into a drag. */
const DRAG_PX = 4;

interface Reattach {
  readonly id: PartId;
  readonly moving: ReadonlyMap<PartId, PartId>;
  readonly poses: Poses;
  /** The doc `retargetPose` will check availability in. */
  readonly check: Doc;
  /** The camera-facing plane through the part's origin at the press, for roots dragged in empty space. */
  readonly plane: Plane;
  readonly grab: Vector3 | null;
  target: { pose: PoseTarget; world: Matrix4 } | { root: Matrix4 } | null;
}

function rayAt(ndc: Vector2): Ray | null {
  const vp = getViewport();
  if (!vp) return null;
  const camera = vp.rig.camera;
  const origin = new Vector3(ndc.x, ndc.y, -1).unproject(camera);
  const far = new Vector3(ndc.x, ndc.y, 1).unproject(camera);
  return new Ray(origin, far.sub(origin).normalize());
}

function beginReattach(id: PartId, ndc: Vector2): Reattach | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const cat = catalogSig.value;
  const world = poses.world.get(id);
  const vp = getViewport();
  if (!cat || !world || !vp) return null;
  const moving = new Map<PartId, PartId>([[id, id]]);
  for (const below of poseDescendants(doc, id)) moving.set(below, id);
  const facing = vp.rig.camera.getWorldDirection(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(facing, positionOf(world));
  const grab = rayAt(ndc)?.intersectPlane(plane, new Vector3()) ?? null;
  transformStateSig.value = 'reattach';
  return { id, moving, poses, check: retargetCheckDoc(doc, cat, id), plane, grab, target: null };
}

/** The drop target under the cursor: a free compatible socket, else a part surface (spec §9.3). */
function findTarget(r: Reattach, ndc: Vector2): Reattach['target'] {
  const doc = docSig.value;
  const cat = catalogSig.value!;
  const conv = cat.conventions;
  const part = doc.parts.get(r.id)!;
  const skip = new Set(r.moving.keys());
  const sock = pickSocket(ndc, skip);
  if (sock) {
    const host = doc.parts.get(sock.part)!;
    const self = defaultChildSocket(cat, part.type, host.type, sock.socket);
    if (
      self !== null &&
      canBeChild(r.check, cat, r.id, self, 'joint').ok &&
      canBeParent(r.check, cat, sock.part, sock.socket).ok
    ) {
      const world = childWorldViaSocket(
        r.poses.world.get(sock.part)!,
        socketMatrix(cat, host.type, sock.socket).m,
        socketMatrix(cat, part.type, self).m,
        part.props,
        conv,
      );
      return {
        pose: { kind: 'socket', part: sock.part, socket: sock.socket, childSocket: self },
        world,
      };
    }
  }
  const hit = pickPart(ndc, skip);
  hoverSig.value = hit?.part ?? null;
  if (hit) {
    const mount = chooseMountSocket(r.check, cat, r.id);
    if (mount === null) return null;
    const frame = cfToMatrix4(frameFromNormal(hit.point.toArray(), hit.normal.toArray()));
    const world = childWorldViaPoint(
      frame,
      new Matrix4(),
      new Matrix4(),
      socketMatrix(cat, part.type, mount).m,
      part.props,
      conv,
    );
    return { pose: { kind: 'surface', part: hit.part, frame, partName: hit.subPart }, world };
  }
  // Empty space: a root follows the cursor; anything else would cancel, so it stays put.
  if (poseConn(part) || !r.grab) return null;
  const at = rayAt(ndc)?.intersectPlane(r.plane, new Vector3());
  return at ? { root: translation(at.sub(r.grab)) } : null;
}

function updateReattach(r: Reattach, ndc: Vector2): void {
  r.target = findTarget(r, ndc);
  const before = r.poses.world.get(r.id)!;
  const t = r.target;
  const delta = !t
    ? new Matrix4()
    : 'root' in t
      ? t.root
      : t.world.clone().multiply(before.clone().invert());
  previewMoving(r.moving, r.poses, () => delta);
}

function endReattach(r: Reattach): void {
  transformStateSig.value = 'idle';
  hoverSig.value = null;
  const cat = catalogSig.value;
  const t = r.target;
  let verdict = { ok: true } as Verdict;
  const patch =
    cat && t
      ? commit('Move 1 part', (d) => {
          if ('root' in t) applyTransform(d, cat, cat.conventions, r.poses, [r.id], () => t.root);
          else verdict = retargetPose(d, cat, cat.conventions, r.poses, r.id, t.pose);
        })
      : null;
  if (patch === null) previewMoving(r.moving, r.poses, () => new Matrix4());
  if (!verdict.ok) toast(verdict.message, 'warn');
}

/**
 * The Move and Rotate tools: the gizmo (placed by the viewport) moves or turns the selection, clicks
 * and box drags select as in the Select tool, and on the Move tool dragging a part re-attaches it.
 */
export function createTransformTool(id: 'move' | 'rotate'): Tool {
  const inner = createSelectTool();
  let press: { x: number; y: number; part: PartId } | null = null;
  let drag: Reattach | null = null;
  let gizmoPress = false;
  const reset = () => {
    if (drag) {
      previewMoving(drag.moving, drag.poses, () => new Matrix4());
      transformStateSig.value = 'idle';
      hoverSig.value = null;
    }
    press = null;
    drag = null;
    gizmoPress = false;
  };
  return {
    id,
    activate() {},
    deactivate() {
      reset();
      inner.deactivate();
    },
    onPointer(e: ToolPointer) {
      if (e.kind === 'move' && e.button === -1) return inner.onPointer!(e);
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        if (getViewport()?.gizmo?.busy()) {
          gizmoPress = true;
          return;
        }
        const hit = id === 'move' ? pickPart(e.ndc) : null;
        if (hit) press = { x: e.x, y: e.y, part: hit.part };
        else inner.onPointer!(e);
        return;
      }
      if (gizmoPress) {
        if (e.kind === 'up') gizmoPress = false;
        return;
      }
      if (!press) return inner.onPointer!(e);
      if (e.kind === 'move') {
        if (!drag && Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX) {
          if (!selectionSig.value.parts.has(press.part)) select([press.part], 'replace');
          drag = beginReattach(press.part, e.ndc);
        }
        if (drag) updateReattach(drag, e.ndc);
      } else if (e.kind === 'up') {
        if (drag) endReattach(drag);
        else {
          const { ids, op } = clickOp(press.part, e);
          select(ids, op);
        }
        press = null;
        drag = null;
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && drag) {
        reset();
        return true;
      }
      return inner.onKey!(e);
    },
  };
}
