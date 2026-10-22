import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const grid: ShapeDef = {
  id: 'grid',
  label: 'Grid',
  params: [
    { key: 'width', label: 'Width', kind: 'number', default: 10, min: 0 },
    { key: 'depth', label: 'Depth', kind: 'number', default: 10, min: 0 },
  ],
  fills: ['solid', 'outline'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, orient, spacing } = input;
    const nx = Math.floor(Number(params.width) / spacing) + 1;
    const nz = Math.floor(Number(params.depth) / spacing) + 1;
    const out: CFrame12[] = [];
    for (let i = 0; i < nx; i++) {
      for (let k = 0; k < nz; k++) {
        const border = i === 0 || i === nx - 1 || k === 0 || k === nz - 1;
        if (fill === 'outline' && !border) continue;
        const pos: Vec3 = [(i - (nx - 1) / 2) * spacing, 0, (k - (nz - 1) / 2) * spacing];
        add(out, orient === 'outward' ? frameFromNormal(pos, [0, 1, 0]) : fixedFrame(...pos));
      }
    }
    return out;
  },
};
