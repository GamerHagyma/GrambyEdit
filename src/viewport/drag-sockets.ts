// The parts whose sockets show while a part or piece is dragged (D25): the one under the cursor, the
// last one under it (so a socket on a part's edge stays as the cursor slides off it), and the parts
// nearest the drag point. Never what is being dragged, nor hidden parts.
import { Vector3 } from 'three';
import type { Poses } from '../core/pose';
import type { Doc, PartId } from '../core/types';

export function dragSocketParts(
  doc: Doc,
  poses: Poses,
  hover: PartId | null,
  drag: {
    readonly point: Vector3;
    readonly near: PartId | null;
    readonly moving: ReadonlySet<PartId>;
  },
  hidden: ReadonlySet<PartId>,
  n: number,
): PartId[] {
  const shows = (id: PartId) => !drag.moving.has(id) && !hidden.has(id);
  const out: PartId[] = [];
  for (const id of [hover, drag.near]) {
    if (id !== null && shows(id) && !out.includes(id)) out.push(id);
  }
  const at = new Vector3();
  const rest: { id: PartId; d: number }[] = [];
  for (const id of doc.order) {
    const m = poses.world.get(id);
    if (m && shows(id) && !out.includes(id)) {
      rest.push({ id, d: at.setFromMatrixPosition(m).distanceToSquared(drag.point) });
    }
  }
  rest.sort((a, b) => a.d - b.d);
  return [...out, ...rest.slice(0, n).map((r) => r.id)];
}
