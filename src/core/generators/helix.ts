import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const helix: ShapeDef = {
  id: 'helix',
  label: 'Helix',
  params: [
    { key: 'radius', label: 'Radius', kind: 'number', default: 3 },
    { key: 'height', label: 'Height', kind: 'number', default: 10 },
    { key: 'turns', label: 'Turns', kind: 'number', default: 3 },
  ],
  fills: ['outline'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, orient, spacing } = input;
    const r = Number(params.radius);
    const h = Number(params.height);
    const w = 2 * Math.PI * Number(params.turns); // θ = w·t
    const n = Math.floor(Math.hypot(w * r, h) / spacing) + 1;
    const out: CFrame12[] = [];
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0; // n = 1 would divide by zero; its single point sits at t = 0
      const theta = w * t;
      const [c, s] = [Math.cos(theta), Math.sin(theta)];
      const p: Vec3 = [r * c, h * t, r * s];
      add(
        out,
        orient === 'tangent'
          ? frameFromNormal(p, [-w * r * s, h, w * r * c])
          : fixedFrame(p[0], p[1], p[2]),
      );
    }
    return out;
  },
};
