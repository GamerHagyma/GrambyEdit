// Build statistics for the footer and the stats panel (spec §13.5): counts, and code bytes per part type.
import { utf8Length } from './codec';
import { orderIndex } from './doc';
import { codeSize, entryBytes } from './size';
import type { Doc, Point, PointKey } from './types';

export interface TypeStat {
  readonly type: string;
  readonly count: number;
  readonly partsPercent: number;
  readonly codeBytes: number;
  readonly codePercent: number;
}

export interface BuildStats {
  readonly parts: number;
  readonly joints: number;
  readonly points: number;
  readonly roots: number;
  readonly types: readonly TypeStat[];
}

/** One point's member in its host's `EphemeralAttachments`, plus the separator after it. */
function pointBytes(uuid: string, point: Point): number {
  const member =
    JSON.stringify(uuid) + ':' + JSON.stringify({ partName: point.partName, cframe: point.cframe });
  return utf8Length(member) + 1;
}

export function buildStats(doc: Doc): BuildStats {
  const position = orderIndex(doc);
  const { jsonBytes } = codeSize(doc);
  const slots = new Map<string, { count: number; codeBytes: number }>();
  const slotOf = (type: string) => {
    let slot = slots.get(type);
    if (slot === undefined) {
      slot = { count: 0, codeBytes: 0 };
      slots.set(type, slot);
    }
    return slot;
  };
  const moved = new Set<PointKey>();
  let joints = 0;
  let points = 0;
  let roots = 0;

  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    const slot = slotOf(part.type);
    slot.count++;
    slot.codeBytes += entryBytes(part, position);
    points += part.points?.size ?? 0;
    if (part.conns.every((c) => c.target.kind === 'raw')) roots++;
    for (const { target } of part.conns) {
      if (target.kind === 'raw') continue;
      joints++;
      if (target.kind !== 'point') continue;
      // A referenced point's bytes move from its host's type to the mounted child's type, once per point.
      const key: PointKey = `${target.part}:${target.uuid}`;
      const host = doc.parts.get(target.part);
      const point = host?.points?.get(target.uuid);
      if (!host || !point || moved.has(key)) continue;
      moved.add(key);
      const bytes = pointBytes(target.uuid, point);
      slotOf(host.type).codeBytes -= bytes;
      slot.codeBytes += bytes;
    }
  }

  const types = [...slots]
    .map(([type, s]): TypeStat => ({
      type,
      count: s.count,
      partsPercent: (s.count / doc.order.length) * 100,
      codeBytes: s.codeBytes,
      codePercent: (s.codeBytes / jsonBytes) * 100,
    }))
    .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1));
  return { parts: doc.order.length, joints, points, roots, types };
}
