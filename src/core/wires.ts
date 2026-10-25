// Internal visual wires between the independently placed pieces of logic parts.
import { Vector3 } from 'three';
import type { Catalog } from './catalog-types';
import { orderIndex } from './doc';
import type { Doc, Issue, PartId } from './types';
import { bodyWorld, computePoses, type Poses } from './pose';

export const WIRE_LIMIT = 10;
export interface WireSegment {
  readonly part: PartId;
  readonly fromBody: number;
  readonly toBody: number;
  readonly from: Vector3;
  readonly to: Vector3;
  readonly length: number;
  readonly stretched: boolean;
}

const TYPES = new Set([
  'Wire',
  'Switch',
  'Button',
  'RemoteButton',
  'PressurePlate',
  'TripWire',
  'Splitter',
  'Splitter_1',
  'Splitter_2',
  'Splitter_3',
  'Splitter_4',
]);

export function wireSegments(doc: Doc, cat: Catalog, poses: Poses): WireSegment[] {
  const out: WireSegment[] = [];
  for (const id of doc.order) {
    const part = doc.parts.get(id)!;
    if (!TYPES.has(part.type)) continue;
    const bodies = cat.parts[part.type]?.bodies;
    if (!bodies || bodies.length < 2) continue;
    const origin = bodyWorld(poses, id, 0);
    if (!origin) continue;
    const from = new Vector3(...bodies[0].pivot).applyMatrix4(origin);
    for (let body = 1; body < bodies.length; body++) {
      const world = bodyWorld(poses, id, body);
      if (!world) continue;
      const to = new Vector3(...bodies[body].pivot).applyMatrix4(world);
      const length = from.distanceTo(to);
      if (!Number.isFinite(length)) continue;
      out.push({
        part: id,
        fromBody: 0,
        toBody: body,
        from: from.clone(),
        to,
        length,
        stretched: length > WIRE_LIMIT,
      });
    }
  }
  return out;
}

export function wireStretchIssues(doc: Doc, cat: Catalog, poses?: Poses): Issue[] {
  if (!doc.order.some((id) => TYPES.has(doc.parts.get(id)!.type))) return [];
  const longest = new Map<PartId, number>();
  for (const segment of wireSegments(doc, cat, poses ?? computePoses(doc, cat, cat.conventions))) {
    if (segment.stretched)
      longest.set(segment.part, Math.max(longest.get(segment.part) ?? 0, segment.length));
  }
  const indexes = orderIndex(doc);
  return [...longest].map(([id, distance]) => ({
    code: 'W-WIRE-STRETCHED',
    severity: 'warning',
    parts: [id],
    message: `${doc.parts.get(id)!.type} #${indexes.get(id)! + 1} is stretched beyond its ${WIRE_LIMIT}-stud in-game limit (longest wire: ${distance.toFixed(2)} studs).`,
  }));
}
