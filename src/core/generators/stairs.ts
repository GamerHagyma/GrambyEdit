import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

export const stairs: ShapeDef = {
  id: 'stairs',
  label: 'Stairs',
  params: [
    { key: 'steps', label: 'Steps', kind: 'int', default: 8 },
    { key: 'rise', label: 'Rise', kind: 'number', default: 1 },
    { key: 'run', label: 'Run', kind: 'number', default: 1 },
    { key: 'width', label: 'Width', kind: 'number', default: 4 },
  ],
  fills: ['solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, spacing } = input;
    const steps = Number(params.steps);
    const rise = Number(params.rise);
    const run = Number(params.run);
    // Centred on the origin in X (x = s·run − (steps − 1)·run/2) and in Z (each row centred on Z = 0).
    const row = Math.floor(Number(params.width) / spacing) + 1;
    const out: CFrame12[] = [];
    for (let s = 0; s < steps; s++) {
      for (let j = 0; j < row; j++) {
        const x = s * run - ((steps - 1) * run) / 2;
        const z = (j - (row - 1) / 2) * spacing;
        add(out, fixedFrame(x, s * rise, z));
      }
    }
    return out;
  },
};
