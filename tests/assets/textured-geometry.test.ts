import { bodyGeometries, partGeometry } from '../../src/assets/geometry';
import { texturedAssets } from '../helpers/textured-assets';

test('packed geometry exposes UVs and material groups without treating paint flags as opacity', () => {
  const assets = texturedAssets();
  const geometry = partGeometry(assets, 'Part');
  expect([...geometry.getAttribute('uv').array]).toEqual([
    0, 0, 1, 0, 0, 1, 0.25, 0.75, 1, 0, 0, 1,
  ]);
  expect(geometry.groups).toEqual([
    { start: 0, count: 3, materialIndex: 0 },
    { start: 3, count: 3, materialIndex: 1 },
  ]);
  expect(geometry.getAttribute('color').getW(0)).toBe(1);
  expect(geometry.getAttribute('color').getW(3)).toBe(0);
});

test('body index compaction remaps material groups while retaining source face mappings', () => {
  const assets = texturedAssets();
  const def = assets.catalog.parts.Part;
  const split = {
    ...assets,
    catalog: {
      ...assets.catalog,
      parts: {
        ...assets.catalog.parts,
        Part: {
          ...def,
          bodies: [
            {
              name: 'Left',
              sockets: [],
              anchor: [-1.5, 0.5, 0] as const,
              pivot: [0, 0, 0] as const,
            },
            {
              name: 'Right',
              sockets: [],
              anchor: [1.5, 0.5, 0] as const,
              pivot: [0, 0, 0] as const,
            },
          ],
        },
      },
    },
  };
  const [left, right] = bodyGeometries(split, 'Part')!;
  expect(left.groups).toEqual([{ start: 0, count: 3, materialIndex: 0 }]);
  expect(right.groups).toEqual([{ start: 0, count: 3, materialIndex: 1 }]);
  expect([...right.userData.faceMap]).toEqual([1]);
  expect(right.getAttribute('uv')).toBe(partGeometry(split, 'Part').getAttribute('uv'));
});
