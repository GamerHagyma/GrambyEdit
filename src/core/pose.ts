// World poses of every part (spec §10): roots from the layout, children through their pose conn.
import { Matrix4 } from 'three';
import { approxSocketFrame, PLACEHOLDER_BOX } from './approx';
import type { Catalog, Conventions } from './catalog-types';
import { cfToMatrix4, IDENTITY_CF } from './cframe';
import { matingMatrix, orientationMatrix } from './conventions';
import { poseAnchors, topoPose } from './graph';
import type { CFrame12, Conn, ConnTarget, Doc, Part, PartId, PointKey, SocketId } from './types';

export const POSE_APPROX = 1,
  POSE_CYCLE = 2,
  POSE_UNKNOWN_TYPE = 4;

export interface Poses {
  readonly world: ReadonlyMap<PartId, Matrix4>;
  readonly flags: ReadonlyMap<PartId, number>;
  readonly approxCount: number;
}

export const EMPTY_POSES: Poses = { world: new Map(), flags: new Map(), approxCount: 0 };

interface Frame {
  /** Shared and cached: never mutate. */
  readonly m: Matrix4;
  readonly approx: boolean;
}
interface SocketFrame extends Frame {
  readonly unknown: boolean;
}

const socketCache = new WeakMap<Catalog, Map<string, SocketFrame>>();

/**
 * A socket's frame in part space. Unknown types and sockets get an approx frame on the placeholder
 * or mesh bbox: on the −Y face when used as a child socket, cycling the faces otherwise.
 */
function socketFrame(
  cat: Catalog,
  type: string,
  socket: SocketId,
  as: 'child' | 'parent',
): SocketFrame {
  let cache = socketCache.get(cat);
  if (!cache) socketCache.set(cat, (cache = new Map()));
  const key = `${type}\u0000${socket}\u0000${as}`;
  let f = cache.get(key);
  if (!f) {
    const def = cat.parts[type];
    const s = def?.sockets[socket];
    if (s) {
      f = { m: cfToMatrix4(s.frame), approx: s.frameSource === 'approx', unknown: false };
    } else {
      const box = def?.mesh ?? PLACEHOLDER_BOX;
      const cf = approxSocketFrame({
        ...box,
        socket,
        side: as,
        name: null,
        parentSockets: [socket],
      });
      f = { m: cfToMatrix4(cf), approx: true, unknown: true };
    }
    cache.set(key, f);
  }
  return f;
}

/** The socket's frame in part space; unknown types and sockets get an approx frame. */
export function socketMatrix(
  cat: Catalog,
  type: string,
  socket: SocketId,
): { m: Matrix4; approx: boolean } {
  const { m, approx } = socketFrame(cat, type, socket, 'parent');
  return { m: m.clone(), approx };
}

/**
 * The frame of a host's sub-piece. A captured frame wins; otherwise the identity (spec §10.3, until
 * probe P6 settles it), approximate for any partName other than the host's main piece.
 */
export function subPartMatrix(
  cat: Catalog,
  type: string,
  partName: string,
): { m: Matrix4; approx: boolean } {
  const def = cat.parts[type];
  const sub = def?.subParts[partName];
  if (sub && !sub.approx) return { m: cfToMatrix4(sub.cframe), approx: false };
  return { m: new Matrix4(), approx: def?.mainPartName !== partName };
}

export type PoseConn = Conn & { readonly target: Exclude<ConnTarget, { kind: 'raw' }> };

/** The conn that poses a part: its first `socket` or `point` conn (raw conns are skipped). */
export function poseConn(part: Part): PoseConn | undefined {
  return part.conns.find((c): c is PoseConn => c.target.kind !== 'raw');
}

/**
 * Where the given parts hang: the parent sockets (`part:socket`) and points (`host:uuid`) their pose
 * conns target. The viewport draws these purple for the selection.
 */
export function poseTargets(
  doc: Doc,
  ids: Iterable<PartId>,
): { sockets: Set<string>; points: Set<PointKey> } {
  const sockets = new Set<string>();
  const points = new Set<PointKey>();
  for (const id of ids) {
    const part = doc.parts.get(id);
    const t = part && poseConn(part)?.target;
    if (t?.kind === 'socket') sockets.add(`${t.part}:${t.socket}`);
    else if (t?.kind === 'point') points.add(`${t.part}:${t.uuid}`);
  }
  return { sockets, points };
}

/** Roots and pseudo-roots in export order: the first at the origin, each next 2 studs past the previous bbox along +X. */
export function defaultRootLayout(doc: Doc, cat: Catalog): Map<PartId, CFrame12> {
  const pseudo = new Set(topoPose(doc).pseudoRoots);
  const out = new Map<PartId, CFrame12>();
  let edge: number | null = null;
  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    if (poseConn(part) && !pseudo.has(id)) continue;
    const box = cat.parts[part.type]?.mesh ?? PLACEHOLDER_BOX;
    const x: number = edge === null ? 0 : edge + 2 - box.min[0];
    out.set(id, [x + 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    edge = x + box.max[0];
  }
  return out;
}

/** Every part's world matrix (float64) and flags. Recomputed per committed doc version (spec §10.7). */
export function computePoses(doc: Doc, cat: Catalog, conv: Conventions): Poses {
  const { order, pseudoRoots } = topoPose(doc);
  const anchors = poseAnchors(doc);
  const pseudo = new Set(pseudoRoots);
  const world = new Map<PartId, Matrix4>();
  const flags = new Map<PartId, number>();
  const mating = matingMatrix(conv);
  // M · S(c, a)⁻¹ per child socket, shared by every part mated through it.
  const tail = new Map<string, Matrix4>();
  let defaults: Map<PartId, CFrame12> | null = null;
  let approxCount = 0;

  for (const id of order) {
    const part = doc.parts.get(id)!;
    let flag = cat.parts[part.type] ? 0 : POSE_UNKNOWN_TYPE;
    const anchor = anchors.get(id);
    const conn = pseudo.has(id)
      ? undefined
      : anchor !== undefined
        ? (part.conns[anchor] as PoseConn)
        : poseConn(part);
    const parentWorld = conn && world.get(conn.target.part);
    let m: Matrix4;
    if (!conn || !parentWorld) {
      // Roots, pseudo-roots, and (in a broken doc) a parent that is missing or posed later.
      const cf =
        doc.layout.get(id) ?? (defaults ??= defaultRootLayout(doc, cat)).get(id) ?? IDENTITY_CF;
      m = cfToMatrix4(cf);
      if (pseudo.has(id)) flag |= POSE_CYCLE;
    } else {
      const t = conn.target;
      const parent = doc.parts.get(t.part)!;
      flag |= flags.get(t.part)! & (POSE_APPROX | POSE_CYCLE);
      const child = socketFrame(cat, part.type, conn.self, 'child');
      if (child.approx) flag |= POSE_APPROX;
      if (child.unknown) flag |= POSE_UNKNOWN_TYPE;
      const key = `${part.type}\u0000${conn.self}`;
      let after = tail.get(key);
      if (!after) tail.set(key, (after = mating.clone().multiply(child.m.clone().invert())));
      m = parentWorld.clone();
      if (t.kind === 'socket') {
        const ps = socketFrame(cat, parent.type, t.socket, 'parent');
        if (ps.approx) flag |= POSE_APPROX;
        m.multiply(ps.m);
        m.multiply(orientationMatrix(part.props, conv));
      } else {
        const point = parent.points?.get(t.uuid);
        // An undeclared uuid (E-UUID) seats the child at the host origin, flagged approximate.
        if (point) {
          const sub = subPartMatrix(cat, parent.type, point.partName);
          if (sub.approx) flag |= POSE_APPROX;
          m.multiply(sub.m).multiply(cfToMatrix4(point.cframe));
        } else {
          flag |= POSE_APPROX;
        }
        if (conv.orientationOnPoints) m.multiply(orientationMatrix(part.props, conv));
      }
      m.multiply(after);
    }
    world.set(id, m);
    flags.set(id, flag);
    if (flag & POSE_APPROX) approxCount++;
  }
  return { world, flags, approxCount };
}
