import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { GenOrient, ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

/** Points on the circle of `radius` in the XZ plane; the count is max(3, round(2πr / spacing)). */
const circle = (radius: number, spacing: number, orient: GenOrient): CFrame12[] => {
  const n = Math.max(3, Math.round((2 * Math.PI * radius) / spacing));
  const out: CFrame12[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const pos: Vec3 = [radius * c, 0, radius * s];
    if (orient === 'fixed') add(out, fixedFrame(...pos));
    else add(out, frameFromNormal(pos, orient === 'outward' ? [c, 0, s] : [-s, 0, c]));
  }
  return out;
};

export const ring: ShapeDef = {
  id: 'ring',
  label: 'Ring',
  params: [{ key: 'radius', label: 'Radius', kind: 'number', default: 5, min: 0 }],
  fills: ['outline', 'solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, orient, spacing } = input;
    const r = Number(params.radius);
    if (fill !== 'solid') return circle(r, spacing, orient);
    // Concentric rings at r - j·spacing while r_j > spacing/2, then the centre. The centre has no
    // radial direction, so it keeps the identity frame.
    const out: CFrame12[] = [];
    for (let j = 0; r - j * spacing > spacing / 2; j++) {
      for (const cf of circle(r - j * spacing, spacing, orient)) add(out, cf);
    }
    add(out, fixedFrame(0, 0, 0));
    return out;
  },
};
