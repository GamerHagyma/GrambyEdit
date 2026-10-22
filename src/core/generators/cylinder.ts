import type { CFrame12 } from '../types';
import { ring } from './ring';
import type { ShapeDef } from './types';
import { add, checkInput } from './common';

/** Raises a frame by dy; the rotation entries are unchanged. */
const lift = (cf: CFrame12, dy: number): CFrame12 => {
  const out: readonly number[] = cf.map((v, i) => (i === 1 ? v + dy : v) + 0);
  return out as CFrame12;
};

export const cylinder: ShapeDef = {
  id: 'cylinder',
  label: 'Cylinder',
  params: [
    { key: 'radius', label: 'Radius', kind: 'number', default: 3, min: 0 },
    { key: 'height', label: 'Height', kind: 'number', default: 6, min: 0 },
  ],
  fills: ['shell', 'solid'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, orient, spacing } = input;
    // Each layer is a ring (shell) or a disc (solid), so the ring's orientation rules apply.
    const base = ring.generate({
      params: { radius: params.radius },
      fill: fill === 'solid' ? 'solid' : 'outline',
      orient,
      spacing,
    });
    const layers = Math.floor(Number(params.height) / spacing) + 1;
    const out: CFrame12[] = [];
    for (let k = 0; k < layers; k++) {
      for (const cf of base) add(out, lift(cf, k * spacing));
    }
    return out;
  },
};
