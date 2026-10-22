import { Matrix4 } from 'three';
import type { CFrame12 } from './types';

export const IDENTITY_CF: CFrame12 = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Rows of the rotation, then the translation column (spec §6, CFrame12 order). */
export function cfToMatrix4(cf: CFrame12, out = new Matrix4()): Matrix4 {
  const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = cf;
  return out.set(r00, r01, r02, x, r10, r11, r12, y, r20, r21, r22, z, 0, 0, 0, 1);
}

/** Matrix4 elements are column-major, so row r, column c sits at `e[4c + r]`. Output has no `-0`. */
export function matrix4ToCf(m: Matrix4): CFrame12 {
  const e = m.elements;
  const out: readonly number[] = [
    e[12],
    e[13],
    e[14],
    e[0],
    e[4],
    e[8],
    e[1],
    e[5],
    e[9],
    e[2],
    e[6],
    e[10],
  ].map((v) => v + 0);
  return out as CFrame12;
}

export function roundCf(cf: CFrame12, posDecimals: number, rotDecimals: number): CFrame12 {
  const posScale = 10 ** posDecimals;
  const rotScale = 10 ** rotDecimals;
  const out: readonly number[] = cf.map((v, i) => {
    const scale = i < 3 ? posScale : rotScale;
    return Math.round(v * scale) / scale + 0;
  });
  return out as CFrame12;
}

export function isCFrame12(v: unknown): v is CFrame12 {
  return (
    Array.isArray(v) &&
    v.length === 12 &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x))
  );
}
