import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const sphere: ShapeDef = {
  id: 'sphere',
  label: 'Sphere',
  params: [{ key: 'radius', label: 'Radius', kind: 'number', default: 4, min: 0 }],
  fills: ['shell', 'solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, orient, spacing } = input;
    const r = Number(params.radius);
    // `dir` is (p - c) / r up to scale; frameFromNormal normalises it, and a zero vector at the
    // centre falls back to +Y.
    const frame = (pos: Vec3, dir: Vec3): CFrame12 =>
      orient === 'outward' ? frameFromNormal(pos, dir) : fixedFrame(...pos);
    const out: CFrame12[] = [];
    if (fill === 'solid') {
      // Lattice points, spaced by `spacing` and centred on c = (0, r, 0), within r of c.
      const n = Math.floor((2 * r) / spacing) + 1;
      const m = (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          for (let k = 0; k < n; k++) {
            const d: Vec3 = [(i - m) * spacing, (j - m) * spacing, (k - m) * spacing];
            if (Math.hypot(d[0], d[1], d[2]) > r) continue;
            add(out, frame([d[0], d[1] + r, d[2]], [d[0] / r, d[1] / r, d[2] / r]));
          }
        }
      }
      return out;
    }
    const n = Math.max(4, Math.round((4 * Math.PI * r * r) / (spacing * spacing)));
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n;
      const rho = Math.sqrt(1 - y * y);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      const dir: Vec3 = [rho * Math.cos(phi), y, rho * Math.sin(phi)];
      add(out, frame([r * dir[0], r * dir[1] + r, r * dir[2]], dir));
    }
    return out;
  },
};
