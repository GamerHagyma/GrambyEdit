import { MathUtils, Matrix4 } from 'three';
import type { Vec3 } from './catalog-types';
import { cfToMatrix4, matrix4ToCf } from './cframe';
import type { CFrame12 } from './types';

/** Candidate roll axes, in priority order. */
const ROLL_SEEDS: readonly Vec3[] = [
  [1, 0, 0],
  [0, 0, 1],
  [0, 1, 0],
];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * An outward frame at `pos` whose +Y follows `normal`, with its roll snapped to the part's axes:
 * local X is the first seed axis least aligned with the normal, projected onto the face plane.
 * A zero-length normal (degenerate triangle) falls back to +Y.
 */
export function frameFromNormal(pos: Vec3, normal: Vec3): CFrame12 {
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  const y: Vec3 = len > 0 ? [normal[0] / len, normal[1] / len, normal[2] / len] : [0, 1, 0];
  let seed = ROLL_SEEDS[0];
  let best = Infinity;
  for (const s of ROLL_SEEDS) {
    const d = Math.abs(dot(s, y));
    if (d < best) [best, seed] = [d, s];
  }
  const k = dot(seed, y);
  const p: Vec3 = [seed[0] - k * y[0], seed[1] - k * y[1], seed[2] - k * y[2]];
  const pl = Math.hypot(p[0], p[1], p[2]);
  const x: Vec3 = [p[0] / pl, p[1] / pl, p[2] / pl];
  const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  const out: readonly number[] = [
    pos[0],
    pos[1],
    pos[2],
    x[0],
    y[0],
    z[0],
    x[1],
    y[1],
    z[1],
    x[2],
    y[2],
    z[2],
  ].map((v) => v + 0);
  return out as CFrame12;
}

/** `cf` turned `degrees` about its own `axis`, in place: a socket rolls about Y and tips about X or Z. */
export function turnFrame(cf: CFrame12, axis: 'x' | 'y' | 'z', degrees: number): CFrame12 {
  const a = MathUtils.degToRad(degrees);
  const turn = new Matrix4();
  if (axis === 'x') turn.makeRotationX(a);
  else if (axis === 'y') turn.makeRotationY(a);
  else turn.makeRotationZ(a);
  return matrix4ToCf(cfToMatrix4(cf).multiply(turn));
}

/** Where a frame's +Y (a socket's outward normal) points: an axis such as "+X" or "−Z", else its direction. */
export function facingLabel(cf: CFrame12): string {
  const y = [cf[4], cf[7], cf[10]];
  const k = [1, 2].reduce((best, i) => (Math.abs(y[i]) > Math.abs(y[best]) ? i : best), 0);
  if (Math.abs(y[k]) > 0.9998) return `${y[k] > 0 ? '+' : '−'}${'XYZ'[k]}`;
  const text = (v: number) => {
    const s = v.toFixed(2);
    return s === '-0.00' ? '0.00' : s.replace('-', '−');
  };
  return `(${y.map(text).join(', ')})`;
}
