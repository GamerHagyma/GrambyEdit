// Transform tools (spec §12.4, §9.3): the Move and Rotate tools, gizmo drags and drag re-attach, plus
// the pure helpers and the preview session they share with the modal G/R (modal.ts).
import { signal } from '@preact/signals';
import { Matrix4, Plane, Quaternion, Vector3, type Vector2 } from 'three';
import { cfToMatrix4 } from '../core/cframe';
import type { Catalog, Conventions } from '../core/catalog-types';
import { childWorldViaPoint, childWorldViaSocket } from '../core/conventions';
import { defaultChildSocket } from '../core/defaults';
import { frameFromNormal } from '../core/frames';
import { poseDescendants } from '../core/graph';
import {
  bodyCheckDoc,
  bodyDescendants,
  chooseMountSocket,
  makeFreeMovable,
  retargetCheckDoc,
  retargetBody,
  retargetPose,
  rotateInPlace,
  setWorldPose,
  topmost,
  turnsInPlace,
  type PoseTarget,
} from '../core/ops/move';
import type { Draft } from '../core/ops/transact';
import {
  bodyOfSocket,
  bodyPivot,
  bodyWorld,
  childSocketMatrix,
  poseConn,
  socketMatrix,
  type Poses,
} from '../core/pose';
import { canBeChild, canBeParent } from '../core/rules';
import type { Doc, PartId, SocketId, Verdict } from '../core/types';
import { posesSig } from '../state/derived';
import { hiddenSig, hoverSig, select, selectionSig, type Selection } from '../state/selection';
import { catalogSig, commit, docSig } from '../state/store';
import { toast } from '../state/toasts';
import { loadPref, savePref } from '../storage/prefs';
import { getViewport } from '../viewport/context';
import { cursorRay, pickPart, pickPoint, pickSocket } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';
import { clickOp, createSelectTool } from './select';

export type PivotMode = 'median' | 'active' | 'individual';
export type Axis = 'X' | 'Y' | 'Z';
export type Space = 'world' | 'local';
/** A world-space transform: a move, or a rotation about a pivot (or about each part's own origin). */
export type TransformDelta =
  /** `grid`: while snapping onto the world grid, its step, so each moved item can land on its own point. */
  | { kind: 'move'; offset: Vector3; grid?: number }
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

/** `offset` changed so that `from + offset` lands on the world grid of `step`, on every axis. */
export function gridOffset(offset: Vector3, from: Vector3, step: number): Vector3 {
  const out = offset.clone();
  for (const k of ['x', 'y', 'z'] as const) out[k] = snapValue(from[k] + offset[k], step) - from[k];
  return out;
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

/** True when `delta` turns a part about its own origin (a rotation that leaves the origin put). */
function turnsAboutOrigin(delta: Matrix4, world: Matrix4): boolean {
  const o = positionOf(world);
  const turn = new Quaternion().setFromRotationMatrix(delta);
  return turn.angleTo(new Quaternion()) > 1e-9 && o.clone().applyMatrix4(delta).distanceTo(o) < 1e-9;
}

/**
 * Moves each of `ids` (topmost parts: none carries another) to `deltaOf(id) · world`; descendants
 * follow. A jointed part turned about its own origin turns through its `Orientation` props, as in
 * game (D-F2); anything else is freed as spec §9.3 says. Returns the reasons of the parts that cannot
 * move.
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
    const delta = deltaOf(id);
    if (turnsInPlace(d.get(id)!, conv) && turnsAboutOrigin(delta, world)) {
      rotateInPlace(d, conv, poses, id, new Quaternion().setFromRotationMatrix(delta));
      continue;
    }
    const free = makeFreeMovable(d, cat, conv, poses, id);
    if (!free.ok) {
      refused.push(free.reason);
      continue;
    }
    setWorldPose(d, cat, conv, poses, id, delta.clone().multiply(world));
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
  /** Topmost parts that turn about their own origin, through `Orientation`, whatever the pivot. */
  readonly inPlace: ReadonlySet<PartId>;
}

/** Starts a transform of the selection; null when nothing is selected or the library is not loaded. */
export function beginSession(): Session | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const sel = [...selectionSig.value.parts].filter((id) => poses.world.has(id));
  const cat = catalogSig.value;
  if (sel.length === 0 || cat === null) return null;
  const ids = topmost(doc, sel);
  const moving = new Map<PartId, PartId>();
  for (const id of ids) {
    moving.set(id, id);
    for (const below of poseDescendants(doc, id)) moving.set(below, id);
  }
  transformStateSig.value = 'transform';
  const inPlace = new Set(ids.filter((id) => turnsInPlace(doc.parts.get(id)!, cat.conventions)));
  return { ids, moving, poses, inPlace };
}

/** Draws the moving parts at `deltaOf(topmost) · world` without changing the doc. */
export function previewMoving(
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

const originDelta = (s: Session, delta: TransformDelta) => (top: PartId) =>
  deltaMatrix(
    delta.kind === 'rotate' && s.inPlace.has(top) ? { ...delta, pivot: 'individual' } : delta,
    positionOf(s.poses.world.get(top)!),
  );

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
  /** The body dragged, for multi-piece parts (D-F3): only it re-attaches; null drags the whole part. */
  readonly body: number | null;
  readonly moving: ReadonlyMap<PartId, PartId>;
  readonly poses: Poses;
  /** The doc `retargetPose` will check availability in. */
  readonly check: Doc;
  /** The camera-facing plane through the part's origin at the press, for roots dragged in empty space. */
  readonly plane: Plane;
  readonly grab: Vector3 | null;
  target: { pose: PoseTarget; world: Matrix4 } | { root: Matrix4 } | null;
}

function beginReattach(id: PartId, ndc: Vector2, body: number | null): Reattach | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const cat = catalogSig.value;
  const world = body === null ? poses.world.get(id) : bodyWorld(poses, id, body);
  const vp = getViewport();
  if (!cat || !world || !vp) return null;
  // A body drag carries only what hangs from that body; the part's other bodies stay.
  const below = body === null ? poseDescendants(doc, id) : bodyDescendants(doc, cat, id, body);
  const moving = new Map<PartId, PartId>(body === null ? [[id, id]] : []);
  for (const other of below) moving.set(other, id);
  const facing = vp.rig.camera.getWorldDirection(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(facing, positionOf(world));
  const grab = cursorRay(ndc)?.intersectPlane(plane, new Vector3()) ?? null;
  transformStateSig.value = 'reattach';
  const check = body === null ? retargetCheckDoc(doc, cat, id) : bodyCheckDoc(doc, cat, id, body);
  return { id, body, moving, poses, check, plane, grab, target: null };
}

/** The child sockets of a dragged body that can take `kind` in the check doc, preferred first. */
function bodySockets(r: Reattach, kind: 'joint' | 'mount', prefer: SocketId | null): SocketId[] {
  const cat = catalogSig.value!;
  const def = cat.parts[docSig.value.parts.get(r.id)!.type];
  const own = (def?.bodies?.[r.body!]?.sockets ?? []).filter((s) => def!.childSockets.includes(s));
  const ok = own.filter((s) => canBeChild(r.check, cat, r.id, s, kind).ok);
  return prefer !== null && ok.includes(prefer) ? [prefer, ...ok.filter((s) => s !== prefer)] : ok;
}

/** The drop target under the cursor: a free compatible socket, else a part surface (spec §9.3). */
function findTarget(r: Reattach, ndc: Vector2): Reattach['target'] {
  const doc = docSig.value;
  const cat = catalogSig.value!;
  const conv = cat.conventions;
  const part = doc.parts.get(r.id)!;
  const skip = new Set([...r.moving.keys(), r.id]);
  if (r.body === null) skip.delete(r.id);
  const sock = pickSocket(ndc, skip, (c) => canBeParent(r.check, cat, c.part, c.socket).ok);
  if (sock) {
    const host = doc.parts.get(sock.part)!;
    const fit = defaultChildSocket(cat, part.type, host.type, sock.socket);
    const self = r.body === null ? fit : (bodySockets(r, 'joint', fit)[0] ?? null);
    if (
      self !== null &&
      canBeChild(r.check, cat, r.id, self, 'joint').ok &&
      canBeParent(r.check, cat, sock.part, sock.socket).ok
    ) {
      const world = childWorldViaSocket(
        bodyWorld(r.poses, sock.part, bodyOfSocket(cat.parts[host.type], sock.socket))!,
        socketMatrix(cat, host.type, sock.socket).m,
        childSocketMatrix(cat, part.type, self, { type: host.type, socket: sock.socket }).m,
        part.props,
        conv,
        bodyPivot(cat, part.type, self),
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
    const mount =
      r.body === null
        ? chooseMountSocket(r.check, cat, r.id)
        : (bodySockets(r, 'mount', null)[0] ?? null);
    if (mount === null) return null;
    const frame = cfToMatrix4(frameFromNormal(hit.point.toArray(), hit.normal.toArray()));
    const world = childWorldViaPoint(
      frame,
      new Matrix4(),
      new Matrix4(),
      childSocketMatrix(cat, part.type, mount, 'point').m,
      part.props,
      conv,
      bodyPivot(cat, part.type, mount),
    );
    return { pose: { kind: 'surface', part: hit.part, frame, partName: hit.subPart }, world };
  }
  // Empty space: a root follows the cursor; anything else (a body too) would cancel, so it stays put.
  if (r.body !== null || poseConn(part) || !r.grab) return null;
  const at = cursorRay(ndc)?.intersectPlane(r.plane, new Vector3());
  return at ? { root: translation(at.sub(r.grab)) } : null;
}

function updateReattach(r: Reattach, ndc: Vector2): void {
  r.target = findTarget(r, ndc);
  const before = (r.body === null ? r.poses.world.get(r.id) : bodyWorld(r.poses, r.id, r.body))!;
  const t = r.target;
  const delta = !t
    ? new Matrix4()
    : 'root' in t
      ? t.root
      : t.world.clone().multiply(before.clone().invert());
  previewMoving(r.moving, r.poses, () => delta);
  if (r.body !== null) previewBody(r, delta.clone().multiply(before));
}

/** Draws the dragged body at `m` (its doc pose to undo the preview). */
function previewBody(r: Reattach, m: Matrix4): void {
  const vp = getViewport();
  vp?.layer?.setBodyPreview(r.id, r.body!, m);
  vp?.request();
}

/** Puts the dragged parts (and body) back where the doc has them. */
function undoPreview(r: Reattach): void {
  previewMoving(r.moving, r.poses, () => new Matrix4());
  if (r.body !== null) previewBody(r, bodyWorld(r.poses, r.id, r.body)!);
}

function endReattach(r: Reattach): void {
  transformStateSig.value = 'idle';
  hoverSig.value = null;
  const cat = catalogSig.value;
  const t = r.target;
  let verdict = { ok: true } as Verdict;
  const type = docSig.value.parts.get(r.id)?.type ?? 'part';
  const patch =
    cat && t
      ? commit(r.body === null ? 'Move 1 part' : `Move ${type} piece`, (d) => {
          if ('root' in t) applyTransform(d, cat, cat.conventions, r.poses, [r.id], () => t.root);
          else if (r.body !== null) verdict = retargetBody(d, cat, r.poses, r.id, r.body, t.pose);
          else verdict = retargetPose(d, cat, cat.conventions, r.poses, r.id, t.pose);
        })
      : null;
  if (patch === null) undoPreview(r);
  if (!verdict.ok) toast(verdict.message, 'warn');
}

/**
 * The Move and Rotate tools: the gizmo (placed by the viewport) moves or turns the selection, clicks
 * and box drags select as in the Select tool, and on the Move tool dragging a part re-attaches it.
 */
export function createTransformTool(id: 'move' | 'rotate'): Tool {
  const inner = createSelectTool();
  let press: { x: number; y: number; part: PartId; body: number } | null = null;
  let drag: Reattach | null = null;
  let gizmoPress = false;
  const reset = () => {
    if (drag) {
      undoPreview(drag);
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
        const hit = id === 'move' && !pickPoint(e.ndc) ? pickPart(e.ndc) : null;
        if (hit) press = { x: e.x, y: e.y, part: hit.part, body: hit.body };
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
          // On a multi-piece part, the body under the cursor moves alone, as in game.
          const type = docSig.value.parts.get(press.part)!.type;
          const pieces = catalogSig.value?.parts[type]?.bodies;
          drag = beginReattach(press.part, e.ndc, pieces ? press.body : null);
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
      return (inner.onKey?.(e) ?? false);
    },
  };
}
