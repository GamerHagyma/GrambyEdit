// Multi-piece parts (D-F3): a Wire's two ends, a splitter's circles, a button's base and circle are
// separate bodies in game, each placed by its own connection. Their meshes come as one; this splits a
// mesh into its connected pieces and gives each piece to the body whose anchor is nearest. The asset
// build and the viewport both call it, so they always agree on which triangle belongs to which body.
import type { Vec3 } from './catalog-types';

export interface BodySplit {
  /** The body of every triangle. */
  readonly triangleBody: Uint8Array;
  /** Each body's bounding box over its triangles (empty boxes stay at ±Infinity). */
  readonly boxes: readonly { readonly min: Vec3; readonly max: Vec3 }[];
}

/** Vertices this close share a position: exporters split vertices along seams. */
const WELD = 1e4;

/**
 * Splits an indexed triangle mesh into connected components (vertices welded by position) and assigns
 * each component to the anchor nearest its bounding-box centre.
 */
export function splitBodies(
  positions: ArrayLike<number>,
  index: ArrayLike<number>,
  anchors: readonly Vec3[],
): BodySplit {
  const vertexCount = positions.length / 3;
  // Union-find over vertices, joined through shared positions and shared triangles.
  const parent = new Int32Array(vertexCount).map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const byPosition = new Map<string, number>();
  for (let v = 0; v < vertexCount; v++) {
    const key = `${Math.round(positions[3 * v] * WELD)},${Math.round(positions[3 * v + 1] * WELD)},${Math.round(positions[3 * v + 2] * WELD)}`;
    const first = byPosition.get(key);
    if (first === undefined) byPosition.set(key, v);
    else join(v, first);
  }
  for (let t = 0; t + 2 < index.length; t += 3) {
    join(index[t], index[t + 1]);
    join(index[t], index[t + 2]);
  }

  // Each component's box, then its body.
  const compBox = new Map<number, { min: number[]; max: number[] }>();
  for (let v = 0; v < vertexCount; v++) {
    const r = find(v);
    let box = compBox.get(r);
    if (!box)
      compBox.set(
        r,
        (box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }),
      );
    for (let a = 0; a < 3; a++) {
      box.min[a] = Math.min(box.min[a], positions[3 * v + a]);
      box.max[a] = Math.max(box.max[a], positions[3 * v + a]);
    }
  }
  const compBody = new Map<number, number>();
  for (const [r, box] of compBox) {
    const c = [0, 1, 2].map((a) => (box.min[a] + box.max[a]) / 2);
    let best = 0;
    let bestD = Infinity;
    anchors.forEach((p, i) => {
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    });
    compBody.set(r, best);
  }

  const triangleBody = new Uint8Array(Math.floor(index.length / 3));
  const boxes = anchors.map(() => ({
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  }));
  for (let t = 0; t < triangleBody.length; t++) {
    const body = compBody.get(find(index[3 * t]))!;
    triangleBody[t] = body;
    for (let k = 0; k < 3; k++) {
      const v = index[3 * t + k];
      for (let a = 0; a < 3; a++) {
        boxes[body].min[a] = Math.min(boxes[body].min[a], positions[3 * v + a]);
        boxes[body].max[a] = Math.max(boxes[body].max[a], positions[3 * v + a]);
      }
    }
  }
  return {
    triangleBody,
    boxes: boxes.map((b) => ({ min: b.min as unknown as Vec3, max: b.max as unknown as Vec3 })),
  };
}
