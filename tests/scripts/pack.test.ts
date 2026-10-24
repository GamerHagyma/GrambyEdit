import { packMeshes, type PackInput } from '../../scripts/lib/pack';

const triangle = (uvs?: Float32Array): PackInput => ({
  type: 'Triangle',
  mesh: {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    ...(uvs ? { uvs } : {}),
    indices: new Uint32Array([0, 1, 2]),
    groups: [],
    min: [0, 0, 0],
    max: [1, 1, 0],
  },
  groups: [{ subPart: 'Shell', color: [40, 80, 120], paintable: true }],
});

test('meshes without UV inputs retain the original binary layout', () => {
  const p = packMeshes([triangle()]);
  expect(p.sections).toEqual({
    positions: [0, 36],
    normals: [36, 36],
    colors: [72, 12],
    indices: [84, 6],
  });
  expect(p.bin.byteLength).toBe(90);
  expect([...new Uint16Array(p.bin.buffer, 84, 3)]).toEqual([0, 1, 2]);
});

test('packs UVs before indices and zero-fills meshes without coordinates', () => {
  const textured = triangle(new Float32Array([0, 1, 1, 0, 0.25, 0.75]));
  const p = packMeshes([textured, triangle()]);
  expect(p.sections).toEqual({
    positions: [0, 72],
    normals: [72, 72],
    colors: [144, 24],
    uvs: [168, 48],
    indices: [216, 12],
  });
  expect([...new Float32Array(p.bin.buffer, 168, 12)]).toEqual([
    0, 1, 1, 0, 0.25, 0.75, 0, 0, 0, 0, 0, 0,
  ]);
  expect([...new Uint16Array(p.bin.buffer, 216, 6)]).toEqual([0, 1, 2, 0, 1, 2]);
  expect(p.meshes.map((m) => m.vertexOffset)).toEqual([0, 3]);
});

test('group vertex splitting preserves UVs, material properties and paintable alpha', () => {
  const input = triangle(new Float32Array([0, 1, 1, 0, 0.25, 0.75]));
  input.mesh.indices = new Uint32Array([0, 1, 2, 2, 1, 0]);
  input.mesh.groups = [
    { material: 'Paint', start: 0, count: 3 },
    { material: 'Glass', start: 3, count: 3 },
  ];
  const p = packMeshes([
    {
      ...input,
      groups: [
        { subPart: 'Shell', color: [40, 80, 120], paintable: true, texture: 'textures/shell.png' },
        {
          subPart: 'Window',
          color: [255, 255, 255],
          paintable: false,
          texture: 'textures/glass.png',
          opacity: 0.25,
          textureAlphaBlend: true,
        },
      ],
    },
  ]);
  expect(p.meshes[0].groups).toEqual([
    {
      subPart: 'Shell',
      color: [40, 80, 120],
      paintable: true,
      texture: 'textures/shell.png',
      start: 0,
      count: 3,
    },
    {
      subPart: 'Window',
      color: [255, 255, 255],
      paintable: false,
      texture: 'textures/glass.png',
      opacity: 0.25,
      textureAlphaBlend: true,
      start: 3,
      count: 3,
    },
  ]);
  expect([...new Float32Array(p.bin.buffer, p.sections.uvs![0], 12)]).toEqual([
    0, 1, 1, 0, 0.25, 0.75, 0.25, 0.75, 1, 0, 0, 1,
  ]);
  expect([...p.bin.slice(144, 168)]).toEqual([
    40, 80, 120, 255, 40, 80, 120, 255, 40, 80, 120, 255, 255, 255, 255, 0, 255, 255, 255, 0, 255,
    255, 255, 0,
  ]);
});
