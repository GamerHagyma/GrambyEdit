import type { Vec3 } from '../catalog-types';
import { frameFromNormal } from '../frames';
import type { CFrame12 } from '../types';
import type { ShapeDef } from './types';
import { add, checkInput, fixedFrame } from './common';

/** -1 on the min face, +1 on the max face, 0 when the index is interior. */
const faceSign = (idx: number, n: number) => (idx === 0 ? -1 : idx === n - 1 ? 1 : 0);

export const box: ShapeDef = {
  id: 'box',
  label: 'Box',
  params: [
    { key: 'width', label: 'Width', kind: 'number', default: 6, min: 0 },
    { key: 'height', label: 'Height', kind: 'number', default: 6, min: 0 },
    { key: 'depth', label: 'Depth', kind: 'number', default: 6, min: 0 },
  ],
  fills: ['solid', 'shell', 'frame'],
  generate(input) {
    if (!checkInput(input)) return [];
    const { params, fill, orient, spacing } = input;
    const nx = Math.floor(Number(params.width) / spacing) + 1;
    const ny = Math.floor(Number(params.height) / spacing) + 1;
    const nz = Math.floor(Number(params.depth) / spacing) + 1;
    const minFaces = fill === 'frame' ? 2 : fill === 'shell' ? 1 : 0;
    const out: CFrame12[] = [];
    for (let i = 0; i < nx; i++) {
      const sx = faceSign(i, nx);
      for (let j = 0; j < ny; j++) {
        const sy = faceSign(j, ny);
        // Boundary faces still needed from k: none → every k, one → only the end layers, two →
        // none qualify. Skipping the rest keeps huge frame and shell boxes linear in their output.
        const need = minFaces - (sx !== 0 ? 1 : 0) - (sy !== 0 ? 1 : 0);
        if (need > 1) continue;
        const ends = need === 1 ? (nz > 1 ? [0, nz - 1] : [0]) : null;
        for (let q = 0; q < (ends ? ends.length : nz); q++) {
          const k = ends ? ends[q] : q;
          const sz = faceSign(k, nz);
          // First face in X, Y, Z order; an interior point has no face, so its normal is zero
          // and frameFromNormal falls back to +Y.
          const normal: Vec3 = sx !== 0 ? [sx, 0, 0] : sy !== 0 ? [0, sy, 0] : [0, 0, sz];
          const pos: Vec3 = [
            (i - (nx - 1) / 2) * spacing,
            j * spacing,
            (k - (nz - 1) / 2) * spacing,
          ];
          add(out, orient === 'outward' ? frameFromNormal(pos, normal) : fixedFrame(...pos));
        }
      }
    }
    return out;
  },
};
