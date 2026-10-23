// Clipboard and prefab operations (spec §9.2): extract a selection as a self-contained sub-document,
// insert a sub-document into a build, and duplicate parts in place.
import { Matrix4 } from 'three';
import type { Catalog, Conventions } from '../catalog-types';
import { cfToMatrix4, IDENTITY_CF, matrix4ToCf } from '../cframe';
import { pointFrameFor } from '../conventions';
import { computePoses, poseConn, socketMatrix, subPartMatrix, type Poses } from '../pose';
import type { CFrame12, Conn, Doc, Part, PartId, Point, SocketId, Uuid } from '../types';
import { newUuid } from '../uuid';
import { draftDoc } from './conns';
import { chooseMountSocket, retargetPose, type PoseTarget } from './move';
import { addPoint } from './points';
import type { Draft } from './transact';

/** `conn` aimed at sub-document ids, or null when it joins a part outside. Raw conns stay only as self-joints. */
function renumber(conn: Conn, subId: ReadonlyMap<PartId, PartId>): Conn | null {
  const { target } = conn;
  if (target.kind === 'raw') return target.self ? conn : null;
  const part = subId.get(target.part);
  if (part === undefined) return null;
  return target.kind === 'socket'
    ? { self: conn.self, target: { kind: 'socket', part, socket: target.socket } }
    : { self: conn.self, target: { kind: 'point', part, uuid: target.uuid } };
}

/**
 * Extracts `ids`, kept in doc order, as a sub-document. `origin[i]` is the source of sub part `i + 1`.
 * A root is a part with no socket or point conn left. The first root sits at identity; the others keep
 * their place relative to it.
 */
function extractParts(
  doc: Doc,
  poses: Poses,
  ids: Iterable<PartId>,
): { sub: Doc; origin: PartId[] } {
  const wanted = new Set(ids);
  const origin = doc.order.filter((id) => wanted.has(id));
  const subId = new Map<PartId, PartId>(origin.map((id, i): [PartId, PartId] => [id, i + 1]));
  const conns = origin.map((id) =>
    doc.parts
      .get(id)!
      .conns.map((c) => renumber(c, subId))
      .filter((c): c is Conn => c !== null),
  );
  // The points the kept mounts land on, by sub-document host id.
  const used = new Map<PartId, Set<Uuid>>();
  for (const c of conns.flat()) {
    if (c.target.kind !== 'point') continue;
    const uuids = used.get(c.target.part) ?? new Set<Uuid>();
    used.set(c.target.part, uuids.add(c.target.uuid));
  }
  const parts = origin.map((id, i): Part => {
    const old = doc.parts.get(id)!;
    const uuids = used.get(i + 1);
    return {
      id: i + 1,
      type: old.type,
      conns: conns[i],
      props: old.props,
      points: old.points && new Map([...old.points].filter(([uuid]) => uuids?.has(uuid))),
    };
  });
  const rootIds = parts.filter((p) => poseConn(p) === undefined).map((p) => p.id);
  const layout = new Map<PartId, CFrame12>();
  if (rootIds.length > 0) {
    const world = (id: PartId): Matrix4 => poses.world.get(origin[id - 1])!;
    const firstInverse = new Matrix4().copy(world(rootIds[0])).invert();
    layout.set(rootIds[0], IDENTITY_CF);
    for (const id of rootIds.slice(1)) {
      layout.set(id, matrix4ToCf(firstInverse.clone().multiply(world(id))));
    }
  }
  const sub: Doc = {
    parts: new Map(parts.map((p): [PartId, Part] => [p.id, p])),
    order: parts.map((p) => p.id),
    layout,
    nextId: origin.length + 1,
  };
  return { sub, origin };
}

/** The parts `ids` as a self-contained sub-document: ids 1..n in doc order, joints kept only between them. */
export function extractSubDoc(doc: Doc, poses: Poses, ids: Iterable<PartId>): Doc {
  return extractParts(doc, poses, ids).sub;
}

/** `conn` aimed at the new ids. Raw conns (self-joints and unresolved references) are copied verbatim. */
function remap(
  conn: Conn,
  ids: ReadonlyMap<PartId, PartId>,
  uuids: ReadonlyMap<PartId, ReadonlyMap<Uuid, Uuid>>,
): Conn {
  const { target } = conn;
  if (target.kind === 'raw') return conn;
  const part = ids.get(target.part);
  if (part === undefined) {
    throw new Error(
      `insertSubDoc: a joint targets part ${target.part}, which is not in the sub-document`,
    );
  }
  if (target.kind === 'socket') {
    return { self: conn.self, target: { kind: 'socket', part, socket: target.socket } };
  }
  // A uuid the host does not declare keeps its value: the sub-document already had it dangling.
  const uuid = uuids.get(target.part)?.get(target.uuid) ?? target.uuid;
  return { self: conn.self, target: { kind: 'point', part, uuid } };
}

/**
 * Inserts `sub` into the draft (spec §9.2): fresh ids appended in sub order, fresh uuids, joints remapped.
 * `{ root }` places every sub root at `root · layout`. `{ target }` attaches the first sub root to the
 * target, then places the other roots relative to where it landed. Returns the new id of each sub part.
 */
export function insertSubDoc(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  sub: Doc,
  at: { target: PoseTarget } | { root: CFrame12 },
): Map<PartId, PartId> {
  const ids = new Map<PartId, PartId>(sub.order.map((id): [PartId, PartId] => [id, d.allocId()]));
  const uuids = new Map<PartId, Map<Uuid, Uuid>>();
  for (const id of sub.order) {
    const points = sub.parts.get(id)!.points;
    if (points) {
      uuids.set(id, new Map([...points.keys()].map((uuid): [Uuid, Uuid] => [uuid, newUuid()])));
    }
  }
  for (const id of sub.order) {
    const part = sub.parts.get(id)!;
    const points =
      part.points &&
      new Map(
        [...part.points].map(([uuid, p]): [Uuid, Point] => {
          const fresh = uuids.get(id)!.get(uuid)!;
          return [fresh, { ...p, uuid: fresh }];
        }),
      );
    d.add({
      id: ids.get(id)!,
      type: part.type,
      conns: part.conns.map((conn) => remap(conn, ids, uuids)),
      props: part.props,
      points,
    });
  }

  const roots = sub.order.filter((id) => poseConn(sub.parts.get(id)!) === undefined);
  const placed = (id: PartId): Matrix4 => cfToMatrix4(sub.layout.get(id) ?? IDENTITY_CF);
  if ('root' in at) {
    const root = cfToMatrix4(at.root);
    for (const id of roots) {
      d.setLayout(ids.get(id)!, matrix4ToCf(root.clone().multiply(placed(id))));
    }
    return ids;
  }
  if (roots.length === 0) {
    throw new Error('Every part in this selection hangs from another, so none can be attached.');
  }
  const [first, ...others] = roots;
  const verdict = retargetPose(d, cat, conv, poses, ids.get(first)!, at.target);
  if (!verdict.ok) throw new Error(verdict.message);
  const firstWorld = computePoses(draftDoc(d), cat, conv).world.get(ids.get(first)!)!;
  for (const id of others) {
    d.setLayout(ids.get(id)!, matrix4ToCf(firstWorld.clone().multiply(placed(id))));
  }
  return ids;
}

/**
 * Mounts a top-level copy on `host` through a new point whose frame puts the copy at `world`. The copy
 * keeps its own joints behind the new mount, so they stay secondary. `retargetPose` would drop them.
 */
function attachCopy(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  host: Part,
  copy: PartId,
  self: SocketId,
  world: Matrix4,
): void {
  const { type, props } = d.get(copy)!;
  const partName = cat.parts[host.type]?.mainPartName ?? host.type;
  const cf = pointFrameFor(
    poses.world.get(host.id)!,
    subPartMatrix(cat, host.type, partName).m,
    world,
    socketMatrix(cat, type, self).m,
    props,
    conv,
  );
  const uuid = addPoint(d, host.id, cf, partName);
  const part = d.get(copy)!;
  const mount: Conn = { self, target: { kind: 'point', part: host.id, uuid } };
  d.set({ ...part, conns: [mount, ...part.conns] });
  d.setLayout(copy, null);
}

/**
 * Duplicates `ids` (spec §9.2): extract, insert, then re-attach each top-level copy. A copy is top-level
 * when its original is a root or hangs from a part outside the selection. A top-level copy with a host is
 * mounted on it at the original's world pose, keeping its own joints. Without a mount socket, a copy with
 * no joints becomes a root at that pose, and a copy with joints keeps its internal pose. Returns the new
 * ids in sub order.
 */
export function duplicate(
  d: Draft,
  cat: Catalog,
  conv: Conventions,
  poses: Poses,
  ids: Iterable<PartId>,
): PartId[] {
  const doc = draftDoc(d);
  const { sub, origin } = extractParts(doc, poses, ids);
  const copies = insertSubDoc(d, cat, conv, poses, sub, { root: IDENTITY_CF });
  // One snapshot: a copy's free sockets depend only on its own joints, which attaching others leaves alone.
  const inserted = draftDoc(d);
  const selected = new Set(origin);
  for (const [i, original] of origin.entries()) {
    const pose = poseConn(doc.parts.get(original)!);
    // Hangs from another selected part: that part's copy carries it.
    if (pose && selected.has(pose.target.part)) continue;
    const copy = copies.get(i + 1)!;
    const world = poses.world.get(original)!;
    const host = pose ? doc.parts.get(pose.target.part) : undefined;
    const self = host ? chooseMountSocket(inserted, cat, copy) : null;
    if (host && self !== null) {
      attachCopy(d, cat, conv, poses, host, copy, self, world);
    } else if (d.get(copy)!.conns.every((c) => c.target.kind === 'raw')) {
      d.setLayout(copy, matrix4ToCf(world));
    }
  }
  return sub.order.map((id) => copies.get(id)!);
}
