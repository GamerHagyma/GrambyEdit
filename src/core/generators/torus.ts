import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const torus: ShapeDef = {
  id: 'torus',
  label: 'Torus',
  params: [
    { key: 'major', label: 'Major radius', kind: 'number', default: 6 },
    { key: 'minor', label: 'Minor radius', kind: 'number', default: 1.5 },
  ],
  fills: ['shell'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, orient, spacing } = input;
    const R = Number(params.major);
    const r = Number(params.minor);
    const n1 = Math.max(3, Math.round((2 * Math.PI * R) / spacing));
    const n2 = Math.max(3, Math.round((2 * Math.PI * r) / spacing));
    const out: CFrame12[] = [];
    for (let i = 0; i < n1; i++) {
      const theta = (2 * Math.PI * i) / n1;
      const [ct, st] = [Math.cos(theta), Math.sin(theta)];
      for (let j = 0; j < n2; j++) {
        const psi = (2 * Math.PI * j) / n2;
        const [cp, sp] = [Math.cos(psi), Math.sin(psi)];
        const p: Vec3 = [(R + r * cp) * ct, r + r * sp, (R + r * cp) * st];
        add(
          out,
          orient === 'outward'
            ? frameFromNormal(p, [cp * ct, sp, cp * st])
            : fixedFrame(p[0], p[1], p[2]),
        );
      }
    }
    return out;
  },
};
