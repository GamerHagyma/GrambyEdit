// Part edits (spec §9.2): add and delete parts.
import { poseConn } from '../pose';
import type { Poses } from '../pose';
import type { Conn, Json, PartId, Uuid } from '../types';
import { settle } from './conns';
import type { Draft } from './transact';

/** Appends a part with a fresh id and returns the id. */
export function addPart(
  d: Draft,
  type: string,
  props: Record<string, Json> = {},
  conns: Conn[] = [],
): PartId {
  if (Object.hasOwn(props, 'EphemeralAttachments')) {
    throw new Error('use point ops for EphemeralAttachments');
  }
  const id = d.allocId();
  d.add({ id, type, conns: [...conns], props: { ...props }, points: null });
  return id;
}

/**
 * Deletes `ids` and every conn that targets them. A survivor that lost its pose conn gets a new one
 * (see `settle`), or becomes a root at its current pose. Points that only the deleted parts' conns
 * used are removed. Returns the survivors that were re-posed and those that became roots.
 */
export function deleteParts(
  d: Draft,
  ids: Iterable<PartId>,
  poses: Poses,
): { reposed: PartId[]; loosened: PartId[] } {
  const gone = new Set(ids);
  const doomed = d.order().filter((id) => gone.has(id));
  const survivors = d.order().filter((id) => !gone.has(id));

  const freed: [PartId, Uuid][] = [];
  for (const id of doomed) {
    for (const c of d.get(id)!.conns) {
      if (c.target.kind === 'point') freed.push([c.target.part, c.target.uuid]);
    }
  }

  // What each survivor keeps, the points they still use, and which of them lost their pose conn.
  const kept = new Map<PartId, readonly Conn[]>();
  const used = new Set<string>();
  const lost = new Set<PartId>();
  for (const id of survivors) {
    const part = d.get(id)!;
    const conns = part.conns.filter((c) => c.target.kind === 'raw' || !gone.has(c.target.part));
    kept.set(id, conns);
    for (const c of conns) {
      if (c.target.kind === 'point') used.add(`${c.target.part}:${c.target.uuid}`);
    }
    const pose = poseConn(part);
    if (pose !== undefined && gone.has(pose.target.part)) lost.add(id);
  }

  for (const id of doomed) d.delete(id);
  // A lost part is a root until `settle` judges it, so no lost part hangs from a conn meanwhile.
  for (const id of survivors) {
    const part = d.get(id)!;
    const conns = kept.get(id)!;
    if (conns.length === part.conns.length) continue;
    const stripped = lost.has(id) ? conns.filter((c) => c.target.kind === 'raw') : conns;
    d.set({ ...part, conns: stripped });
  }

  for (const [host, uuid] of freed) {
    const h = d.get(host);
    if (h === undefined || used.has(`${host}:${uuid}`) || !h.points?.has(uuid)) continue;
    const points = new Map(h.points);
    points.delete(uuid);
    d.set({ ...h, points });
  }

  const reposed: PartId[] = [];
  const loosened: PartId[] = [];
  for (const id of survivors) {
    if (!lost.has(id)) continue;
    const posed = settle(d, id, kept.get(id)!, poses);
    (posed === 'posed' ? reposed : loosened).push(id);
  }
  return { reposed, loosened };
}
