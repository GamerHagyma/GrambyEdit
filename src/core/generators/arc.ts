import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const arc: ShapeDef = {
  id: 'arc',
  label: 'Arc',
  params: [
    { key: 'radius', label: 'Radius', kind: 'number', default: 5 },
    { key: 'angle', label: 'Angle', kind: 'number', default: 90, min: 1, max: 360 },
  ],
  fills: ['outline'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, spacing } = input;
    const r = Number(params.radius);
    const sweep = (Number(params.angle) * Math.PI) / 180;
    const n = Math.max(2, Math.round((sweep * r) / spacing) + 1);
    const out: CFrame12[] = [];
    for (let i = 0; i < n; i++) {
      const theta = (sweep * i) / (n - 1);
      add(out, fixedFrame(r * Math.cos(theta), 0, r * Math.sin(theta)));
    }
    return out;
  },
};
