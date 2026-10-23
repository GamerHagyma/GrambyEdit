// Ephemeral connection points (spec §9.2). A point holds at most one child.
import { graphIndex } from '../graph';
import type { Poses } from '../pose';
import { newUuid } from '../uuid';
import type { CFrame12, PartId, Point, Uuid } from '../types';
import { detach, draftDoc, removeConn } from './conns';
import { deleteParts } from './parts';
import type { Draft } from './transact';

/** Adds a point to `host` and returns its uuid, a new one unless given. A null point map becomes a Map. */
export function addPoint(
  d: Draft,
  host: PartId,
  cframe: CFrame12,
  partName: string,
  uuid: Uuid = newUuid(),
): Uuid {
  const part = d.get(host)!;
  if (part.points?.has(uuid)) throw new Error(`addPoint: part ${host} already has point ${uuid}`);
  const points = new Map<Uuid, Point>(part.points ?? []);
  points.set(uuid, { uuid, partName, cframe });
  d.set({ ...part, points });
  return uuid;
}

export function setPointCFrame(d: Draft, host: PartId, uuid: Uuid, cframe: CFrame12): void {
  const part = d.get(host)!;
  const point = part.points?.get(uuid);
  if (point === undefined) throw new Error(`setPointCFrame: part ${host} has no point ${uuid}`);
  const points = new Map<Uuid, Point>(part.points ?? []);
  points.set(uuid, { ...point, cframe });
  d.set({ ...part, points });
}

/**
 * Removes a point. Its child is detached (it keeps its place, as `detach` does) or deleted with
 * `deleteParts`, which also drops the point when nothing else used it.
 */
export function deletePoint(
  d: Draft,
  host: PartId,
  uuid: Uuid,
  childPolicy: 'detach' | 'delete',
  poses: Poses,
): void {
  if (!d.get(host)!.points?.has(uuid)) {
    throw new Error(`deletePoint: part ${host} has no point ${uuid}`);
  }
  const refs = graphIndex(draftDoc(d)).pointUsers.get(`${host}:${uuid}`) ?? [];
  const children = [...new Set(refs.map((ref) => ref.child))];
  if (childPolicy === 'delete') deleteParts(d, children, poses);
  else for (const child of children) detachMount(d, child, host, uuid, poses);

  const part = d.get(host);
  if (part?.points?.has(uuid)) {
    const points = new Map(part.points);
    points.delete(uuid);
    d.set({ ...part, points });
  }
}

/** Drops every conn of `child` that mounts on the point: the pose conn through `detach`, others alone. */
function detachMount(d: Draft, child: PartId, host: PartId, uuid: Uuid, poses: Poses): void {
  const mountAt = (): number =>
    d
      .get(child)!
      .conns.findIndex(
        (c) => c.target.kind === 'point' && c.target.part === host && c.target.uuid === uuid,
      );
  for (let at = mountAt(); at >= 0; at = mountAt()) {
    const pose = d.get(child)!.conns.findIndex((c) => c.target.kind !== 'raw');
    if (at === pose) detach(d, child, poses);
    else removeConn(d, child, at);
  }
}
