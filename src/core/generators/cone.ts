import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

/**
 * Points on a round ring of radius r (sides < 3), or on a regular `sides`-gon perimeter, as [x, z].
 * Pyramid vertices sit at 2πi/sides; each edge gets round(edge / spacing) equal steps, corners included.
 */
function ring(r: number, sides: number, spacing: number): number[][] {
  if (sides < 3) {
    const n = Math.max(3, Math.round((2 * Math.PI * r) / spacing));
    return Array.from({ length: n }, (_, i) => {
      const phi = (2 * Math.PI * i) / n;
      return [r * Math.cos(phi), r * Math.sin(phi)];
    });
  }
  const step = (2 * Math.PI) / sides;
  const k = Math.max(1, Math.round((2 * r * Math.sin(Math.PI / sides)) / spacing));
  const pts: number[][] = [];
  for (let i = 0; i < sides; i++) {
    const a = step * i;
    const [ax, az] = [r * Math.cos(a), r * Math.sin(a)];
    const [bx, bz] = [r * Math.cos(a + step), r * Math.sin(a + step)];
    for (let j = 0; j < k; j++) {
      const t = j / k;
      pts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  return pts;
}

export const cone: ShapeDef = {
  id: 'cone',
  label: 'Cone',
  params: [
    { key: 'radius', label: 'Radius', kind: 'number', default: 3 },
    { key: 'height', label: 'Height', kind: 'number', default: 6 },
    { key: 'sides', label: 'Sides (0 = round)', kind: 'int', default: 0, min: 0, max: 8 },
  ],
  fills: ['shell', 'solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, spacing } = input;
    const R = Number(params.radius);
    const H = Number(params.height);
    const sides = Math.round(Number(params.sides));
    const out: CFrame12[] = [];
    for (let k = 0; k <= Math.floor(H / spacing); k++) {
      const y = k * spacing;
      const rk = R * (1 - y / H);
      if (rk < spacing / 2) {
        add(out, fixedFrame(0, y, 0));
        continue;
      }
      // shell: the outer ring. solid: also the inner rings (r − j·spacing while > spacing/2) and the centre.
      const radii = [rk];
      if (fill === 'solid') {
        for (let j = 1; rk - j * spacing > spacing / 2; j++) radii.push(rk - j * spacing);
      }
      for (const rj of radii) {
        for (const [x, z] of ring(rj, sides, spacing)) add(out, fixedFrame(x, y, z));
      }
      if (fill === 'solid') add(out, fixedFrame(0, y, 0));
    }
    return out;
  },
};
