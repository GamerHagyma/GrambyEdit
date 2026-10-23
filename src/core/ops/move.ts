// Moving parts (spec §9.3): "mirror the game" without ever silently breaking a signal joint.
import { Matrix4, Vector3 } from 'three';
import type { Catalog, Conventions } from '../catalog-types';
import { matrix4ToCf } from '../cframe';
import { pointFrameFor } from '../conventions';
import { graphIndex, poseDescendants } from '../graph';
import { orderIndex } from '../doc';
import { poseConn, socketMatrix, subPartMatrix, type Poses } from '../pose';
import { canBeChild, canBeParent, canTakeChild, isSignalJoint } from '../rules';
import type { Conn, Doc, Part, PartId, SocketId, Uuid, Verdict } from '../types';
import { draftDoc } from './conns';
import { addPoint, setPointCFrame } from './points';
import { propApplies, setProp } from './props';
import type { Draft } from './transact';

export type PoseTarget =
  | { kind: 'socket'; part: PartId; socket: SocketId; childSocket?: SocketId }
  | { kind: 'point'; part: PartId; uuid: Uuid }
  /** `frame` is the new point's world frame: +Y out of the host's surface at the drop. */
  | { kind: 'surface'; part: PartId; frame: Matrix4; partName: string };

export type MoveResult = { ok: true; via: 'point' | 'layout' } | { ok: false; reason: string };

const POSE_CYCLE: Verdict = {
  ok: false,
  code: 'pose-cycle',
  message: 'A part cannot be attached to its own children.',
};

/** `doc` with one part's conns replaced: availability checks without the joint being replaced. */
function withConns(doc: Doc, id: PartId, conns: readonly Conn[]): Doc {
  const parts = new Map(doc.parts);
  parts.set(id, { ...doc.parts.get(id)!, conns });
  return { ...doc, parts };
}

/** The child socket a part should mount by: the first whose whole piece is free, `defaultMount` first. */
export function chooseMountSocket(doc: Doc, cat: Catalog, id: PartId): SocketId | null {
  const part = doc.parts.get(id)!;
  const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
  const candidates = def ? [def.defaultMount, ...def.childSockets] : [poseConn(part)?.self];
  for (const s of new Set(candidates)) {
    if (s && canBeChild(doc, cat, id, s, 'mount').ok) return s;
  }
  return null;
}

const label = (doc: Doc, id: PartId) =>
  `${doc.parts.get(id)!.type} #${orderIndex(doc).get(id)! + 1}`;

/** A new point on `host` where `id`, mounted by `socket`, sits exactly at its current world pose. */
function pointAtCurrentPose(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  id: PartId,
  host: PartId,
  socket: SocketId,
): Uuid {
  const part = d.get(id)!;
  const h = d.get(host)!;
  const partName = cat.parts[h.type]?.mainPartName ?? h.type;
  const cf = pointFrameFor(
    poses.world.get(host)!,
    subPartMatrix(cat, h.type, partName).m,
    poses.world.get(id)!,
    socketMatrix(cat, part.type, socket).m,
    part.props,
    conv,
  );
  return addPoint(d, host, cf, partName);
}

/**
 * Prepares a part for a free move (spec §9.3). A part on a point, or a root, is already free. A
 * structural joint whose piece is otherwise unused becomes a mount on a new point on the same parent;
 * a signal joint (or a shared piece) stays as a secondary conn behind a new mount on another free
 * piece. Nothing moves on screen. Refused, with a reason, when no free piece is left.
 */
export function makeFreeMovable(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  id: PartId,
): MoveResult {
  const part = d.get(id)!;
  const pc = poseConn(part);
  if (!pc) return { ok: true, via: 'layout' };
  if (pc.target.kind === 'point') return { ok: true, via: 'point' };
  const doc = draftDoc(d);
  const parentId = pc.target.part;
  const parent = d.get(parentId)!;
  const rest = part.conns.filter((c) => c !== pc);
  const signal = isSignalJoint(cat, part.type, pc.self, parent.type, pc.target.socket);

  let socket: SocketId | null = null;
  let keepOld = true;
  // Case 3: checked with the replaced joint already removed.
  if (!signal && canBeChild(withConns(doc, id, rest), cat, id, pc.self, 'mount').ok) {
    socket = pc.self;
    keepOld = false;
  } else {
    // Case 4: the old joint stays, so its piece stays taken.
    socket = chooseMountSocket(doc, cat, id);
  }
  if (socket === null) {
    return {
      ok: false,
      reason: `${label(doc, id)} has no free connection point to mount on without breaking its joint to ${label(doc, parentId)}. Detach it first to move it freely.`,
    };
  }
  const uuid = pointAtCurrentPose(d, cat, conv, poses, id, parentId, socket);
  const mount: Conn = { self: socket, target: { kind: 'point', part: parentId, uuid } };
  d.set({ ...d.get(id)!, conns: [mount, ...(keepOld ? part.conns : rest)] });
  return { ok: true, via: 'point' };
}

/** Moves a free part (see `makeFreeMovable`) to a world pose: its point's frame, or its layout. */
export function setWorldPose(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  id: PartId,
  world: Matrix4,
): void {
  const part = d.get(id)!;
  const pc = poseConn(part);
  if (!pc) {
    d.setLayout(id, matrix4ToCf(world));
    return;
  }
  if (pc.target.kind !== 'point')
    throw new Error(`setWorldPose: part ${id} is socket-joined; free it first`);
  const host = d.get(pc.target.part)!;
  const point = host.points?.get(pc.target.uuid);
  if (!point) throw new Error(`setWorldPose: point ${pc.target.uuid} is missing`);
  const cf = pointFrameFor(
    poses.world.get(host.id)!,
    subPartMatrix(cat, host.type, point.partName).m,
    world,
    socketMatrix(cat, part.type, pc.self).m,
    part.props,
    conv,
  );
  setPointCFrame(d, host.id, point.uuid, cf);
}

/** Removes `uuid` from `host` when no conn uses it any more. */
function dropUnusedPoint(d: Draft, host: PartId, uuid: Uuid): void {
  const h = d.get(host);
  if (!h?.points?.has(uuid)) return;
  if (graphIndex(draftDoc(d)).pointUsers.has(`${host}:${uuid}`)) return;
  const points = new Map(h.points);
  points.delete(uuid);
  d.set({ ...h, points });
}

/** The conns a re-attach keeps: all but the pose conn, which stays (as secondary) only when it is a signal joint. */
function replacedPose(
  doc: Doc,
  cat: Catalog,
  id: PartId,
): { keepOld: boolean; rest: readonly Conn[] } {
  const part = doc.parts.get(id)!;
  const pc = poseConn(part);
  const keepOld =
    pc?.target.kind === 'socket' &&
    isSignalJoint(cat, part.type, pc.self, doc.parts.get(pc.target.part)!.type, pc.target.socket);
  return { keepOld, rest: keepOld || !pc ? part.conns : part.conns.filter((c) => c !== pc) };
}

/** The doc `retargetPose` checks socket availability in: `id` without the joint a re-attach replaces. */
export function retargetCheckDoc(doc: Doc, cat: Catalog, id: PartId): Doc {
  return withConns(doc, id, replacedPose(doc, cat, id).rest);
}

/**
 * Re-attaches a part (drag and drop, spec §9.3): a new pose conn to a socket, a point, or a new point
 * on a surface. The old pose conn is dropped, unless it is a signal joint, which stays secondary.
 * `_conv` is unused: a surface drop places the point frame itself, and the pose follows from it.
 */
export function retargetPose(
  d: Draft,
  cat: Catalog,
  _conv: Conventions,
  poses: Poses,
  id: PartId,
  target: PoseTarget,
): Verdict {
  const doc = draftDoc(d);
  if (target.part === id || poseDescendants(doc, id).has(target.part)) return POSE_CYCLE;
  const part = d.get(id)!;
  const pc = poseConn(part);
  const { keepOld, rest } = replacedPose(doc, cat, id);
  const check = withConns(doc, id, rest);

  let conn: Conn;
  if (target.kind === 'socket') {
    const self = target.childSocket ?? firstJointSocket(check, cat, id);
    if (self === null)
      return {
        ok: false,
        code: 'no-socket',
        message: 'This part has no free socket to join with.',
      };
    const child = canBeChild(check, cat, id, self, 'joint');
    if (!child.ok) return child;
    const host = canBeParent(check, cat, target.part, target.socket);
    if (!host.ok) return host;
    conn = { self, target: { kind: 'socket', part: target.part, socket: target.socket } };
  } else {
    const self = chooseMountSocket(check, cat, id);
    if (self === null)
      return {
        ok: false,
        code: 'no-socket',
        message: 'This part has no free connection point to mount on.',
      };
    let uuid: Uuid;
    if (target.kind === 'point') {
      const host = canTakeChild(check, target.part, target.uuid);
      if (!host.ok) return host;
      uuid = target.uuid;
    } else {
      const h = d.get(target.part)!;
      const cf = matrix4ToCf(
        new Matrix4()
          .copy(poses.world.get(target.part)!)
          .multiply(subPartMatrix(cat, h.type, target.partName).m)
          .invert()
          .multiply(target.frame),
      );
      uuid = addPoint(d, target.part, cf, target.partName);
    }
    conn = { self, target: { kind: 'point', part: target.part, uuid } };
  }
  d.set({ ...d.get(id)!, conns: [conn, ...rest] });
  if (!pc) d.setLayout(id, null);
  if (pc?.target.kind === 'point' && !keepOld) dropUnusedPoint(d, pc.target.part, pc.target.uuid);
  return { ok: true };
}

function firstJointSocket(doc: Doc, cat: Catalog, id: PartId): SocketId | null {
  const part: Part = doc.parts.get(id)!;
  const def = Object.hasOwn(cat.parts, part.type) ? cat.parts[part.type] : undefined;
  for (const s of new Set([def?.defaultMount ?? null, ...(def?.childSockets ?? [])])) {
    if (s && canBeChild(doc, cat, id, s, 'joint').ok) return s;
  }
  return null;
}

/** The selected parts that no other selected part carries: only these move; the rest follow. */
export function topmost(doc: Doc, ids: Iterable<PartId>): PartId[] {
  const list = [...ids];
  const carried = new Set<PartId>();
  for (const id of list) for (const below of poseDescendants(doc, id)) carried.add(below);
  return list.filter((id) => !carried.has(id));
}

const AXES = { X: [1, 0, 0], Y: [0, 1, 0] } as const;

/**
 * Rotates a part in place by `degrees` about its own X or Y axis. Socket-joined parts that take the
 * matching `Orientation` prop rotate the game's way, through that prop; others are freed and turned
 * through their point or layout.
 */
export function nativeRotate(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  id: PartId,
  axis: 'X' | 'Y',
  degrees: number,
): void {
  const part = d.get(id)!;
  const key = `Orientation${axis}`;
  if (poseConn(part)?.target.kind === 'socket' && propApplies(cat, part, key)) {
    const now = typeof part.props[key] === 'number' ? (part.props[key] as number) : 0;
    setProp(d, cat, [id], key, now + degrees);
    return;
  }
  if (!makeFreeMovable(d, cat, conv, poses, id).ok) return;
  const [x, y, z] = AXES[axis];
  const turn = new Matrix4().makeRotationAxis(new Vector3(x, y, z), (degrees * Math.PI) / 180);
  setWorldPose(d, cat, conv, poses, id, poses.world.get(id)!.clone().multiply(turn));
}
