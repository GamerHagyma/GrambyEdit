import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const line: ShapeDef = {
  id: 'line',
  label: 'Line',
  params: [{ key: 'length', label: 'Length', kind: 'number', default: 10, min: 0 }],
  fills: ['solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, orient, spacing } = input;
    const n = Math.floor(Number(params.length) / spacing) + 1;
    const out: CFrame12[] = [];
    for (let i = 0; i < n; i++) {
      const pos: Vec3 = [(i - (n - 1) / 2) * spacing, 0, 0];
      add(out, orient === 'tangent' ? frameFromNormal(pos, [1, 0, 0]) : fixedFrame(...pos));
    }
    return out;
  },
};
