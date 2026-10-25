// Transform tools (spec §12.4, §9.3): the Move and Rotate tools, gizmo drags and drag re-attach, plus
// the pure helpers and the preview session they share with the modal G/R (modal.ts).
import { signal } from '@preact/signals';
import { Matrix4, Plane, Quaternion, Vector3, type Vector2 } from 'three';
import { cfToMatrix4 } from '../core/cframe';
import type { Catalog, Conventions } from '../core/catalog-types';
import { childWorldViaPoint, childWorldViaSocket } from '../core/conventions';
import { defaultChildSocket } from '../core/defaults';
import { frameFromNormal } from '../core/frames';
import { orderIndex } from '../core/doc';
import { poseDescendants } from '../core/graph';
import { draftDoc } from '../core/ops/conns';
import {
  bodyCheckDoc,
  bodyDescendants,
  chooseMountSocket,
  makeFreeMovable,
  pieceBodies,
  retargetCheckDoc,
  retargetBody,
  retargetPose,
  selfStackRefusal,
  rotateInPlace,
  setWorldPose,
  transformPiece,
  turnsInPlace,
  type PoseTarget,
} from '../core/ops/move';
import type { Draft } from '../core/ops/transact';
import {
  bodyOfSocket,
  bodyPivot,
  bodyWorld,
  childSocketMatrix,
  ignoresOrientation,
  leadBody,
  piecePivot,
  poseConn,
  socketMatrix,
  type Poses,
} from '../core/pose';
import { canBeChild, canBeParent } from '../core/rules';
import type { Conn, Doc, PartId, SocketId, Verdict } from '../core/types';
import { posesSig } from '../state/derived';
import {
  hiddenSig,
  hoverPieceSig,
  hoverSig,
  select,
  selectPiece,
  selectionSig,
  type Selection,
} from '../state/selection';
import { catalogSig, commit, docSig } from '../state/store';
import { shiftSocketSig, socketFocusSig, socketCursorSig } from '../state/socket-focus';
import { toast } from '../state/toasts';
import { loadPref, savePref } from '../storage/prefs';
import { getViewport } from '../viewport/context';
import { cursorRay, pickPart, pickSocketWhere } from '../viewport/raycast';
import type { Tool, ToolPointer } from './manager';
import { boxNextSig, createClickSelect, createSelectTool, hasPieces, pressAt } from './select';

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

/**
 * The transform pivot: the active part's origin, or the mean of the origins (also for individual).
 * `originOf` gives a part's origin where it is not its world position: a selected piece's (D25).
 */
export function pivotOf(
  poses: Poses,
  ids: readonly PartId[],
  mode: PivotMode,
  active: PartId | null,
  originOf: (id: PartId) => Vector3 | undefined = () => undefined,
): Vector3 {
  const at = (id: PartId) => {
    const m = poses.world.get(id);
    return m ? (originOf(id) ?? positionOf(m)) : undefined;
  };
  const own = mode === 'active' && active !== null ? at(active) : undefined;
  if (own) return own;
  const sum = new Vector3();
  let n = 0;
  for (const id of ids) {
    const p = at(id);
    if (!p) continue;
    sum.add(p);
    n++;
  }
  return n > 0 ? sum.divideScalar(n) : sum;
}

/** Where a piece turns: its body's pivot in world space; the part's origin when either is unknown. */
export function pieceOrigin(
  poses: Poses,
  cat: Catalog,
  doc: Doc,
  id: PartId,
  body: number,
): Vector3 {
  const world = bodyWorld(poses, id, body) ?? poses.world.get(id) ?? new Matrix4();
  const type = doc.parts.get(id)?.type;
  const pivot = type === undefined ? undefined : piecePivot(cat, type, body);
  return (pivot?.clone() ?? new Vector3()).applyMatrix4(world);
}

/** A selection's origins (for `pivotOf`) and the world matrices its local axes turn with. */
export function selectionFrame(
  doc: Doc,
  poses: Poses,
  sel: Selection,
  cat: Catalog | null | undefined,
): {
  originOf: (id: PartId) => Vector3 | undefined;
  worldOf: (id: PartId) => Matrix4 | undefined;
} {
  const piece = (id: PartId) => (cat ? sel.pieces.get(id) : undefined);
  return {
    originOf: (id) => {
      const b = piece(id);
      return b === undefined ? undefined : pieceOrigin(poses, cat!, doc, id, b);
    },
    worldOf: (id) => {
      const b = piece(id);
      return b === undefined ? poses.world.get(id) : bodyWorld(poses, id, b);
    },
  };
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
/** Whether `delta` turns at all. */
const turns = (delta: Matrix4) =>
  new Quaternion().setFromRotationMatrix(delta).angleTo(new Quaternion()) > 1e-9;

/** The part's label when it hangs from a Spinner's or Servo's socket, which keeps its default turn. */
function spunBy(d: Draft, cat: Catalog, id: PartId): string | null {
  const t = poseConn(d.get(id)!)?.target;
  const parent = t?.kind === 'socket' ? d.get(t.part) : undefined;
  if (t?.kind !== 'socket' || !parent || !ignoresOrientation(cat, parent.type, t.socket)) {
    return null;
  }
  const doc = draftDoc(d);
  return `${d.get(id)!.type} #${orderIndex(doc).get(id)! + 1}`;
}

function turnsAboutOrigin(delta: Matrix4, world: Matrix4): boolean {
  const o = positionOf(world);
  const turn = new Quaternion().setFromRotationMatrix(delta);
  return (
    turn.angleTo(new Quaternion()) > 1e-9 && o.clone().applyMatrix4(delta).distanceTo(o) < 1e-9
  );
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
    const spun = spunBy(d, cat, id);
    if (spun && turns(delta)) {
      refused.push(
        `${spun} sits on a Spinner or Servo, which keeps it at its default turn in game.`,
      );
      continue;
    }
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
  cat?: Catalog | null,
): { position: Vector3; quaternion: Quaternion } | null {
  const ids = [...sel.parts].filter((id) => doc.parts.has(id) && poses.world.has(id));
  if (ids.length === 0) return null;
  const active = typeof sel.active === 'number' && sel.parts.has(sel.active) ? sel.active : null;
  const { originOf, worldOf } = selectionFrame(doc, poses, sel, cat);
  const quaternion = new Quaternion();
  if (space === 'local') {
    worldOf(active ?? ids[ids.length - 1])!.decompose(new Vector3(), quaternion, new Vector3());
  }
  return { position: pivotOf(poses, ids, mode, active, originOf), quaternion };
}

const plural = (verb: string, n: number, noun = 'part') =>
  `${verb} ${n} ${noun}${n === 1 ? '' : 's'}`;

/** A transform in progress over the selection's topmost items; the doc changes only at `finish`. */
export interface Session {
  doc: Doc;
  selection: Selection;
  /** Topmost items: whole parts, and parts of which one piece moves (`pieces`). */
  readonly ids: readonly PartId[];
  /**
   * Every part drawn moved whole (topmost whole parts and the descendants of every item), mapped to
   * its topmost item. A piece item's own part is not here: its moving bodies are (`pieces`).
   */
  readonly moving: ReadonlyMap<PartId, PartId>;
  readonly poses: Poses;
  /** Topmost whole parts that turn about their own origin, through `Orientation`, whatever the pivot. */
  readonly inPlace: ReadonlySet<PartId>;
  /** Piece items (D25): the piece, the bodies its move carries (`pieceBodies`), and its origin. */
  readonly pieces: ReadonlyMap<PartId, { body: number; bodies: number[]; origin: Vector3 }>;
}

interface Item {
  readonly id: PartId;
  /** The piece that moves; null for the whole part. */
  readonly body: number | null;
  readonly bodies: number[];
  /** Every part that moves with it whole: the part itself and its descendants for a whole item. */
  readonly moves: ReadonlySet<PartId>;
  /** What it hangs from: a piece's own conn, else the part's pose conn. */
  readonly anchor: Conn['target'] | undefined;
}

/** The selection as transform items, without those another item already carries. */
function sessionItems(doc: Doc, cat: Catalog, poses: Poses, sel: Selection): Item[] {
  const items: Item[] = [];
  for (const id of sel.parts) {
    const part = doc.parts.get(id);
    if (!part || !poses.world.has(id)) continue;
    const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
    const pc = poseConn(part);
    const piece = sel.pieces.get(id);
    // A part that hangs from nothing moves whole, every piece with it (P5).
    if (piece === undefined || !pc || !def?.bodies?.[piece]) {
      const moves = new Set([id, ...poseDescendants(doc, id)]);
      items.push({ id, body: null, bodies: [], moves, anchor: pc?.target });
      continue;
    }
    const bodies = pieceBodies(doc, cat, id, piece);
    const moves = new Set<PartId>();
    for (const b of bodies) for (const below of bodyDescendants(doc, cat, id, b)) moves.add(below);
    const sockets = def.bodies[piece].sockets;
    const own = part.conns.find((c) => c.target.kind !== 'raw' && sockets.includes(c.self));
    items.push({ id, body: piece, bodies, moves, anchor: (own ?? pc).target });
  }
  /** Whether moving `it` moves what `t` points at. */
  const carries = (it: Item, t: Conn['target']): boolean => {
    if (t.kind === 'raw') return false;
    if (it.moves.has(t.part)) return true;
    if (it.body === null || t.part !== it.id) return false;
    const part = doc.parts.get(it.id)!;
    const def = cat.parts[part.type];
    // Points ride the lead body.
    const b = t.kind === 'socket' ? bodyOfSocket(def, t.socket) : leadBody(def, part);
    return it.bodies.includes(b);
  };
  return items.filter((it) => {
    const t = it.anchor;
    return !t || !items.some((o) => o !== it && carries(o, t));
  });
}

/** Starts a transform of the selection; null when nothing is selected or the library is not loaded. */
function sessionFor(selection: Selection): Session | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const cat = catalogSig.value;
  if (cat === null) return null;
  const items = sessionItems(doc, cat, poses, selection);
  if (items.length === 0) return null;
  const moving = new Map<PartId, PartId>();
  const pieces = new Map<PartId, { body: number; bodies: number[]; origin: Vector3 }>();
  for (const it of items) {
    for (const id of it.moves) moving.set(id, it.id);
    if (it.body !== null) {
      const origin = pieceOrigin(poses, cat, doc, it.id, it.body);
      pieces.set(it.id, { body: it.body, bodies: it.bodies, origin });
    }
  }
  const ids = items.map((it) => it.id);
  const inPlace = new Set(
    ids.filter((id) => !pieces.has(id) && turnsInPlace(doc.parts.get(id)!, cat.conventions)),
  );
  return { doc, selection, ids, moving, poses, inPlace, pieces };
}

export function beginSession(): Session | null {
  const s = sessionFor(selectionSig.value);
  if (s) transformStateSig.value = 'transform';
  return s;
}
/** Keep the session identity but use current graph/poses, including concurrent moves and reparenting. */
function rebaseSession(s: Session): Session | null {
  if (s.doc === docSig.peek()) return s;
  const next = sessionFor(s.selection);
  if (!next) return null;
  Object.assign(s, next);
  return s;
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
    s.pieces.get(top)?.origin ?? positionOf(s.poses.world.get(top)!),
  );

/** Draws each piece item's moving bodies at `deltaOf(id) · body world`. */
function previewPieces(s: Session, deltaOf: (id: PartId) => Matrix4): void {
  const vp = getViewport();
  if (!vp?.layer) return;
  for (const [id, { bodies }] of s.pieces) {
    const delta = deltaOf(id);
    for (const b of bodies) {
      const world = bodyWorld(s.poses, id, b);
      if (world) vp.layer.setBodyPreview(id, b, delta.clone().multiply(world));
    }
  }
  vp.request();
}

export function previewSession(s: Session, delta: TransformDelta): void {
  if (!rebaseSession(s)) return;
  previewMoving(s.moving, s.poses, originDelta(s, delta));
  previewPieces(s, originDelta(s, delta));
}

/** Puts the moving parts back where the doc has them. */
export function cancelSession(s: Session): void {
  const current = rebaseSession(s) ?? s,
    poses = posesSig.peek();
  previewMoving(current.moving, poses, () => new Matrix4());
  previewPieces({ ...current, poses }, () => new Matrix4());
  transformStateSig.value = 'idle';
}

/** Commits the transform as one history entry; refused parts stay and are listed in a toast. */
export function finishSession(s: Session, delta: TransformDelta): void {
  if (!rebaseSession(s)) return cancelSession(s);
  const cat = catalogSig.value;
  transformStateSig.value = 'idle';
  if (!cat) return cancelSession(s);
  let refused: string[] = [];
  const verb = delta.kind === 'move' ? 'Move' : 'Rotate';
  const noun = s.pieces.size === s.ids.length ? 'piece' : 'part';
  const deltaOf = originDelta(s, delta);
  const whole = s.ids.filter((id) => !s.pieces.has(id));
  const patch = commit(plural(verb, s.ids.length, noun), (d) => {
    refused = applyTransform(d, cat, cat.conventions, s.poses, whole, deltaOf);
    for (const [id, { body }] of s.pieces) {
      const v = transformPiece(d, cat, cat.conventions, s.poses, id, body, deltaOf(id));
      if (!v.ok) refused.push(v.message);
    }
  });
  if (patch === null) cancelSession(s);
  if (refused.length > 0) toast(refused.join('\n'), 'warn');
}

let gizmoSession: Session | null = null;
let gizmoDelta: TransformDelta | null = null;
export function refreshTransformPreview(): void {
  if (gizmoSession && gizmoDelta) previewSession(gizmoSession, gizmoDelta);
}

/** What the viewport gizmo calls as a drag starts, moves, ends or is cancelled (Esc). */
export const gizmoHandlers = {
  start(): void {
    gizmoDelta = null;
    gizmoSession = beginSession();
  },
  change(delta: TransformDelta): void {
    gizmoDelta = delta;
    if (gizmoSession) previewSession(gizmoSession, delta);
  },
  end(delta: TransformDelta): void {
    const s = gizmoSession;
    gizmoSession = null;
    gizmoDelta = null;
    if (s) finishSession(s, delta);
  },
  cancel(): void {
    const s = gizmoSession;
    gizmoSession = null;
    gizmoDelta = null;
    if (s) cancelSession(s);
  },
};

/** Movement past this many pixels turns a press on a part into a drag. */
const DRAG_PX = 4;
/** A drag drops onto the nearest socket that takes it within this many pixels (D25). */
export const SNAP_PX = 20;

/**
 * A drag re-attach in progress, for the sockets the view shows (D25): the last point under the cursor,
 * the last part under it, and what is being dragged.
 */
export const reattachSig = signal<{
  readonly point: Vector3;
  readonly near: PartId | null;
  readonly moving: ReadonlySet<PartId>;
} | null>(null);

interface Reattach {
  readonly doc: Doc;
  readonly group: Session | null;
  readonly ndc: Vector2;
  readonly id: PartId;
  /** The body dragged, for multi-piece parts (D-F3): only it re-attaches; null drags the whole part. */
  readonly body: number | null;
  readonly bodies: readonly number[];
  readonly moving: ReadonlyMap<PartId, PartId>;
  readonly poses: Poses;
  /** The doc `retargetPose` will check availability in. */
  readonly check: Doc;
  /** The camera-facing plane through the part's origin at the press, for roots dragged in empty space. */
  readonly plane: Plane;
  readonly grab: Vector3 | null;
  target: { pose: PoseTarget; world: Matrix4 } | { root: Matrix4 } | null;
  /** The last point and part under the cursor (`reattachSig`). */
  point: Vector3;
  near: PartId | null;
}

function beginReattach(
  id: PartId,
  ndc: Vector2,
  body: number | null,
  selection = selectionSig.value,
): Reattach | null {
  const doc = docSig.value;
  const poses = posesSig.value;
  const cat = catalogSig.value;
  const group = body === null || selection.parts.size > 1 ? sessionFor(selection) : null;
  if (group) id = group.moving.get(id) ?? id;
  const world = body === null ? poses.world.get(id) : bodyWorld(poses, id, body);
  const vp = getViewport();
  if (!cat || !world || !vp) return null;
  // A body drag carries only what hangs from that body; the part's other bodies stay.
  const below = body === null ? poseDescendants(doc, id) : bodyDescendants(doc, cat, id, body);
  const moving = group
    ? new Map(group.moving)
    : new Map<PartId, PartId>(body === null ? [[id, id]] : []);
  if (!group) for (const other of below) moving.set(other, id);
  const facing = vp.rig.camera.getWorldDirection(new Vector3());
  const plane = new Plane().setFromNormalAndCoplanarPoint(facing, positionOf(world));
  const grab = cursorRay(ndc)?.intersectPlane(plane, new Vector3()) ?? null;
  transformStateSig.value = 'reattach';
  const check = body === null ? retargetCheckDoc(doc, cat, id) : bodyCheckDoc(doc, cat, id, body);
  const bodies = body === null ? [] : pieceBodies(doc, cat, id, body);
  return {
    doc,
    group,
    ndc: ndc.clone(),
    id,
    body,
    bodies,
    moving,
    poses,
    check,
    plane,
    grab,
    target: null,
    point: positionOf(world),
    near: null,
  };
}

/** The child sockets of a dragged body that can take `kind` in the check doc, preferred first. */
function bodySockets(
  r: Reattach,
  kind: 'joint' | 'mount',
  prefer: SocketId | null,
  check = r.check,
): SocketId[] {
  const cat = catalogSig.value!;
  const def = cat.parts[docSig.value.parts.get(r.id)!.type];
  const own = (def?.bodies?.[r.body!]?.sockets ?? []).filter((s) => def!.childSockets.includes(s));
  const ok = own.filter((s) => canBeChild(check, cat, r.id, s, kind).ok);
  return prefer !== null && ok.includes(prefer) ? [prefer, ...ok.filter((s) => s !== prefer)] : ok;
}

/** The drop target under the cursor: a free compatible socket, else a part surface (spec §9.3). */
function findTarget(r: Reattach, ndc: Vector2): Reattach['target'] {
  socketCursorSig.value = ndc.clone();
  const doc = docSig.value;
  const cat = catalogSig.value!;
  const conv = cat.conventions;
  const part = doc.parts.get(r.id);
  if (!part) return null;
  const skip = new Set(r.moving.keys());
  const def = cat.parts[part.type];
  let checkedDoc = r.doc,
    check = r.check;
  const refusesSelf = (target: PoseTarget): boolean =>
    target.part === r.id &&
    (r.body === null ||
      selfStackRefusal(def, r.body, target, check.parts.get(r.id)!.conns) !== null);
  /** The child socket that would join a host socket, or null when that joint is refused. */
  const selfFor = (c: { part: PartId; socket: SocketId }): SocketId | null => {
    const current = docSig.peek();
    if (!current.parts.has(r.id)) return null;
    if (current !== checkedDoc) {
      checkedDoc = current;
      check =
        r.body === null
          ? retargetCheckDoc(current, cat, r.id)
          : bodyCheckDoc(current, cat, r.id, r.body);
    }
    if (
      !check.parts.has(c.part) ||
      skip.has(c.part) ||
      !canBeParent(check, cat, c.part, c.socket).ok
    )
      return null;
    if (refusesSelf({ kind: 'socket', ...c })) return null;
    const fit = defaultChildSocket(
      cat,
      current.parts.get(r.id)!.type,
      current.parts.get(c.part)!.type,
      c.socket,
    );
    const self = r.body === null ? fit : (bodySockets(r, 'joint', fit, check)[0] ?? null);
    return self !== null && canBeChild(check, cat, r.id, self, 'joint').ok ? self : null;
  };
  socketFocusSig.value = (c) => selfFor(c) !== null;
  const sock = pickSocketWhere(ndc, (c) => selfFor(c) !== null, SNAP_PX);
  if (sock) {
    const host = doc.parts.get(sock.part)!;
    const self = selfFor(sock)!;
    const at = bodyWorld(r.poses, sock.part, bodyOfSocket(cat.parts[host.type], sock.socket))!;
    const frame = socketMatrix(cat, host.type, sock.socket, host.props).m;
    const world = childWorldViaSocket(
      at,
      frame,
      childSocketMatrix(cat, part.type, self, { type: host.type, socket: sock.socket }).m,
      ignoresOrientation(cat, host.type, sock.socket) ? {} : part.props,
      conv,
      bodyPivot(cat, part.type, self),
    );
    r.point = positionOf(at.clone().multiply(frame));
    r.near = sock.part;
    return {
      pose: { kind: 'socket', part: sock.part, socket: sock.socket, childSocket: self },
      world,
    };
  }
  const hit = pickPart(ndc, skip, r.body === null ? undefined : { part: r.id, body: r.body });
  hoverSig.value = hit?.part ?? null;
  // A target lights whole.
  hoverPieceSig.value = null;
  if (hit) {
    r.point = hit.point.clone();
    r.near = hit.part;
    if (shiftSocketSig.peek()) return null;
    const mount =
      r.body === null
        ? chooseMountSocket(r.check, cat, r.id)
        : (bodySockets(r, 'mount', null)[0] ?? null);
    if (mount === null) return null;
    const frame = cfToMatrix4(frameFromNormal(hit.point.toArray(), hit.normal.toArray()));
    const pose: PoseTarget = {
      kind: 'surface',
      part: hit.part,
      frame,
      partName: hit.subPart,
      body: hit.body,
    };
    if (refusesSelf(pose)) return null;
    const world = childWorldViaPoint(
      frame,
      new Matrix4(),
      new Matrix4(),
      childSocketMatrix(cat, part.type, mount, 'point').m,
      part.props,
      conv,
      bodyPivot(cat, part.type, mount),
    );
    return { pose, world };
  }
  const underCursor = cursorRay(ndc)?.intersectPlane(r.plane, new Vector3());
  if (underCursor) r.point = underCursor;
  if (shiftSocketSig.peek()) return null;
  // Empty space: a root follows the cursor; anything else (a body too) would cancel, so it stays put.
  if (r.body !== null || poseConn(part) || !r.grab) return null;
  const at = cursorRay(ndc)?.intersectPlane(r.plane, new Vector3());
  return at ? { root: translation(at.sub(r.grab)) } : null;
}

function updateReattach(r: Reattach, ndc: Vector2): void {
  r.ndc.copy(ndc);
  if (r.doc !== docSig.peek()) {
    if (!docSig.peek().parts.has(r.id)) {
      r.target = null;
      return;
    }
    const next = beginReattach(r.id, ndc, r.body, r.group?.selection);
    if (!next) {
      r.target = null;
      return;
    }
    Object.assign(r, { ...next, plane: r.plane, grab: r.grab });
  }
  r.target = findTarget(r, ndc);
  reattachSig.value = {
    point: r.point,
    near: r.near ?? (r.body === null ? null : r.id),
    moving: new Set(r.moving.keys()),
  };
  const before = (r.body === null ? r.poses.world.get(r.id) : bodyWorld(r.poses, r.id, r.body))!;
  const t = r.target;
  const delta = !t
    ? new Matrix4()
    : 'root' in t
      ? t.root
      : t.world.clone().multiply(before.clone().invert());
  previewMoving(r.moving, r.poses, () => delta);
  if (r.group) previewPieces(r.group, () => delta);
  if (r.body !== null) previewBody(r, delta.clone().multiply(before));
}

/** Draws the dragged body at `m` (its doc pose to undo the preview). */
function previewBody(r: Reattach, m: Matrix4): void {
  const vp = getViewport();
  const delta = m.clone().multiply(bodyWorld(r.poses, r.id, r.body!)!.clone().invert());
  for (const b of r.bodies) {
    vp?.layer?.setBodyPreview(r.id, b, delta.clone().multiply(bodyWorld(r.poses, r.id, b)!));
  }
  vp?.request();
}

/** Puts the dragged parts (and body) back where the doc has them. */
function undoPreview(r: Reattach): void {
  const poses = posesSig.peek();
  previewMoving(r.moving, poses, () => new Matrix4());
  if (r.group) previewPieces({ ...r.group, poses }, () => new Matrix4());
  if (r.body !== null) {
    const world = bodyWorld(poses, r.id, r.body);
    if (world) previewBody({ ...r, poses }, world);
  }
}

function moveReattachGroup(
  d: Draft,
  r: Reattach,
  cat: Catalog,
  delta: Matrix4,
  skipPrimary: boolean,
): void {
  const group = r.group;
  const whole = group
    ? group.ids.filter((id) => (!skipPrimary || id !== r.id) && !group.pieces.has(id))
    : skipPrimary
      ? []
      : [r.id];
  const refused = applyTransform(d, cat, cat.conventions, r.poses, whole, () => delta);
  for (const [id, { body }] of group?.pieces ?? []) {
    if (skipPrimary && id === r.id) continue;
    const v = transformPiece(d, cat, cat.conventions, r.poses, id, body, delta);
    if (!v.ok) refused.push(v.message);
  }
  if (refused.length) throw new Error(refused.join('\n'));
}

function endReattach(r: Reattach): void {
  socketFocusSig.value = null;
  transformStateSig.value = 'idle';
  reattachSig.value = null;
  hoverSig.value = null;
  const cat = catalogSig.value;
  const t = r.target;
  let verdict = { ok: true } as Verdict;
  const type = docSig.value.parts.get(r.id)?.type ?? 'part';
  let patch = null;
  try {
    patch =
      cat && t
        ? commit(r.body === null ? 'Move 1 part' : `Move ${type} piece`, (d) => {
            if ('root' in t) moveReattachGroup(d, r, cat, t.root, false);
            else if (r.body !== null) {
              verdict = retargetBody(d, cat, r.poses, r.id, r.body, t.pose);
              if (!verdict.ok) throw new Error(verdict.message);
              moveReattachGroup(
                d,
                r,
                cat,
                t.world.clone().multiply(bodyWorld(r.poses, r.id, r.body)!.clone().invert()),
                true,
              );
            } else {
              verdict = retargetPose(d, cat, cat.conventions, r.poses, r.id, t.pose);
              if (!verdict.ok) throw new Error(verdict.message);
              const delta = t.world.clone().multiply(r.poses.world.get(r.id)!.clone().invert());
              moveReattachGroup(d, r, cat, delta, true);
            }
          })
        : null;
  } catch (e) {
    undoPreview(r);
    toast((e as Error).message, 'warn');
    return;
  }
  if (patch === null) undoPreview(r);
  if (!verdict.ok) toast(verdict.message, 'warn');
}

/**
 * The Move, Rotate and Select tools: the gizmo (placed by the viewport, Move and Rotate only) moves or
 * turns the selection, clicks and box drags select as in the plain select tool, and dragging a part
 * re-attaches the selection in Select/Move. The Move center handle does the same; arrows/planes transform.
 */
export function createTransformTool(id: 'move' | 'rotate' | 'select'): Tool {
  const inner = createSelectTool();
  const click = createClickSelect(hasPieces);
  let press: { x: number; y: number; part: PartId; body: number } | null = null;
  let drag: Reattach | null = null;
  let gizmoPress = false;
  let centerPress = false;
  const reset = () => {
    socketFocusSig.value = null;
    if (drag) {
      undoPreview(drag);
      transformStateSig.value = 'idle';
      reattachSig.value = null;
      hoverSig.value = null;
    }
    press = null;
    drag = null;
    gizmoPress = false;
    centerPress = false;
  };
  return {
    id,
    activate() {},
    deactivate() {
      reset();
      inner.deactivate();
    },
    onPointer(e: ToolPointer) {
      shiftSocketSig.value = e.shift;
      if (e.kind === 'move' && e.button === -1) return inner.onPointer!(e);
      if (e.button !== 0) return;
      if (e.kind === 'down') {
        if (boxNextSig.peek()) return inner.onPointer!(e);
        const pressed = id === 'rotate' ? null : pressAt(e.ndc);
        const gizmo = getViewport()?.gizmo;
        if (gizmo?.busy()) {
          // The center carries the selected parts/pieces onto sockets; arrows and planes keep their transforms.
          const sel = selectionSig.value;
          const candidate =
            pressed?.hit && sel.parts.has(pressed.hit.part)
              ? pressed.hit.part
              : typeof sel.active === 'number' && sel.parts.has(sel.active)
                ? sel.active
                : [...sel.parts][0];
          const yields = id !== 'rotate' && gizmo.axis() === 'XYZ' && candidate !== undefined;
          if (!yields) {
            gizmoPress = true;
            return;
          }
          gizmo.cancel();
          centerPress = true;
          press = {
            x: e.x,
            y: e.y,
            part: candidate!,
            body: sel.pieces.get(candidate!) ?? pressed?.hit?.body ?? 0,
          };
          return;
        }
        const drags = id !== 'rotate';
        const hit = pressed && !pressed.point && drags ? pressed.hit : null;
        if (hit) press = { x: e.x, y: e.y, part: hit.part, body: hit.body };
        else inner.onPointer!(e);
        return;
      }
      if (gizmoPress) {
        if (e.kind === 'up') gizmoPress = false;
        return;
      }
      if (!press) return inner.onPointer!(e);
      if (!docSig.peek().parts.has(press.part)) {
        reset();
        return;
      }
      if (e.kind === 'move') {
        if (!drag && Math.hypot(e.x - press.x, e.y - press.y) > DRAG_PX) {
          if (!selectionSig.value.parts.has(press.part)) {
            if (hasPieces(press.part)) selectPiece(press.part, press.body, 'replace');
            else select([press.part], 'replace');
          }
          // On a multi-piece part, the body under the cursor moves alone, as in game.
          const type = docSig.value.parts.get(press.part)!.type;
          const pieces = catalogSig.value?.parts[type]?.bodies;
          drag = beginReattach(
            press.part,
            e.ndc,
            pieces && selectionSig.value.pieces.has(press.part) ? press.body : null,
          );
        }
        if (drag) updateReattach(drag, e.ndc);
      } else if (e.kind === 'up') {
        if (drag) {
          updateReattach(drag, e.ndc);
          endReattach(drag);
        } else if (!centerPress)
          click({ part: press.part, body: press.body }, e, performance.now());
        press = null;
        drag = null;
        centerPress = false;
      }
    },
    onKey(e: KeyboardEvent) {
      if (e.key === 'Shift') {
        shiftSocketSig.value = e.type !== 'keyup';
        if (drag) updateReattach(drag, drag.ndc);
        return false;
      }
      if (e.key === 'Escape' && drag) {
        reset();
        return true;
      }
      return inner.onKey?.(e) ?? false;
    },
  };
}
