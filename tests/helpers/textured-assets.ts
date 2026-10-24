import { packMeshes } from '../../scripts/lib/pack';
import type { Assets } from '../../src/assets/geometry';
import { MINI } from './catalog';

export function texturedAssets(): Assets {
  const packed = packMeshes([
    {
      type: 'Part',
      mesh: {
        positions: new Float32Array([-2, 0, 0, -1, 0, 0, -2, 1, 0, 1, 0, 0, 2, 0, 0, 1, 1, 0]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uvs: new Float32Array([0, 0, 1, 0, 0, 1, 0.25, 0.75, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
        groups: [
          { material: 'paint', start: 0, count: 3 },
          { material: 'glass', start: 3, count: 3 },
        ],
        min: [-2, 0, 0],
        max: [2, 1, 0],
      },
      groups: [
        { subPart: 'Left', color: [100, 110, 120], paintable: true },
        {
          subPart: 'Right',
          color: [255, 255, 255],
          paintable: false,
          texture: 'textures/right.png',
          opacity: 0.4,
        },
      ],
    },
  ]);
  const def = {
    ...MINI.parts.Part,
    mesh: { id: 0, min: [-2, 0, 0] as const, max: [2, 1, 0] as const },
  };
  return {
    catalog: { ...MINI, parts: { ...MINI.parts, Part: def } },
    manifest: { version: 'fixture', sections: packed.sections, meshes: packed.meshes },
    bin: packed.bin.buffer,
  };
}
