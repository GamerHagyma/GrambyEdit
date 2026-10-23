// Code-size optimiser (spec §16): rounds point frames and drops points that no conn mounts on.
import { roundCf } from './cframe';
import type { Draft } from './ops/transact';
import type { Point, Uuid } from './types';

export interface OptimizeOptions {
  posDecimals: number;
  rotDecimals: number;
  dropUnusedPoints: boolean;
  dropEmptyAttachments: boolean;
}

/**
 * Rounds the point frames of every part, drops points that no conn targets, and turns an empty
 * attachment map into `null`. Conns and every other prop are left alone. A part is set only when
 * something in it changed, so a pass that changes nothing records nothing.
 */
export function optimizeDoc(
  d: Draft,
  opts: OptimizeOptions,
): { pointsRemoved: number; numbersRounded: number; emptiedRemoved: number } {
  const order = d.order();
  // Conns do not change in this pass, so the points they use are read once, before any part is set.
  const used = new Set<string>();
  // An unresolved raw joint may still name a point; such a uuid is kept on every host.
  const rawUuids = new Set<unknown>();
  for (const id of order) {
    for (const { target } of d.get(id)!.conns) {
      if (target.kind === 'point') used.add(`${target.part}:${target.uuid}`);
      else if (target.kind === 'raw') rawUuids.add(target.triple[1]);
    }
  }

  let pointsRemoved = 0;
  let numbersRounded = 0;
  let emptiedRemoved = 0;
  for (const id of order) {
    const part = d.get(id)!;
    if (part.points === null) continue;
    const kept = new Map<Uuid, Point>();
    let changed = false;
    for (const [uuid, point] of part.points) {
      if (opts.dropUnusedPoints && !used.has(`${id}:${uuid}`) && !rawUuids.has(uuid)) {
        pointsRemoved++;
        changed = true;
        continue;
      }
      const cframe = roundCf(point.cframe, opts.posDecimals, opts.rotDecimals);
      if (cframe.some((v, i) => v !== point.cframe[i])) {
        numbersRounded++;
        changed = true;
        kept.set(uuid, { ...point, cframe });
      } else {
        kept.set(uuid, point);
      }
    }
    const emptied = opts.dropEmptyAttachments && kept.size === 0;
    if (emptied) emptiedRemoved++;
    if (changed || emptied) d.set({ ...part, points: emptied ? null : kept });
  }
  return { pointsRemoved, numbersRounded, emptiedRemoved };
}
