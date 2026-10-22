// A bounding-volume hierarchy over part bounding spheres (spec §11.2): narrows each pick ray to the
// few parts whose sphere it passes through, so exact triangle tests run only on those.
import type { Vec3 } from '../core/catalog-types';

interface Item {
  readonly id: number;
  readonly center: Vec3;
  readonly radius: number;
}

interface Node {
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  readonly items: readonly Item[] | null;
  readonly left: Node | null;
  readonly right: Node | null;
}

const LEAF_SIZE = 8;
/** Slack on node boxes so float error never culls a sphere the exact test would keep. */
const SLACK = 1e-6;

function build(items: Item[]): Node {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const it of items) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], it.center[a] - it.radius - SLACK);
      max[a] = Math.max(max[a], it.center[a] + it.radius + SLACK);
    }
  }
  if (items.length <= LEAF_SIZE) return { min, max, items, left: null, right: null };
  // Median split along the longest axis of the centres.
  let axis = 0;
  let span = -1;
  for (let a = 0; a < 3; a++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const it of items) {
      lo = Math.min(lo, it.center[a]);
      hi = Math.max(hi, it.center[a]);
    }
    if (hi - lo > span) [span, axis] = [hi - lo, a];
  }
  items.sort((p, q) => p.center[axis] - q.center[axis]);
  const mid = items.length >> 1;
  return {
    min,
    max,
    items: null,
    left: build(items.slice(0, mid)),
    right: build(items.slice(mid)),
  };
}

/** Does the ray from `o` along `d`, for t ≥ 0, meet the box? */
function hitsBox(n: Node, o: Vec3, d: Vec3): boolean {
  let t0 = 0;
  let t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    if (d[a] === 0) {
      if (o[a] < n.min[a] || o[a] > n.max[a]) return false;
      continue;
    }
    const inv = 1 / d[a];
    let near = (n.min[a] - o[a]) * inv;
    let far = (n.max[a] - o[a]) * inv;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

export class SphereBVH {
  private readonly root: Node | null;

  constructor(items: readonly Item[]) {
    this.root = items.length ? build([...items]) : null;
  }

  /**
   * Ids of the spheres within their radius of the ray `o + t·d`, t ≥ 0, measured from the closest
   * ray point (so a sphere containing the origin always counts). `d` must be a unit vector.
   */
  rayCandidates(o: Vec3, d: Vec3): number[] {
    const out: number[] = [];
    const stack: Node[] = this.root ? [this.root] : [];
    while (stack.length) {
      const n = stack.pop()!;
      if (!hitsBox(n, o, d)) continue;
      if (n.items) {
        for (const it of n.items) {
          const oc = [it.center[0] - o[0], it.center[1] - o[1], it.center[2] - o[2]];
          const t = Math.max(0, oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2]);
          const p = [
            o[0] + d[0] * t - it.center[0],
            o[1] + d[1] * t - it.center[1],
            o[2] + d[2] * t - it.center[2],
          ];
          if (Math.hypot(p[0], p[1], p[2]) <= it.radius) out.push(it.id);
        }
      } else {
        stack.push(n.left!, n.right!);
      }
    }
    return out;
  }
}
