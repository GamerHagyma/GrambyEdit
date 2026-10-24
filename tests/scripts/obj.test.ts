import { readFileSync } from 'node:fs';
import { parseObj } from '../../scripts/lib/obj';

const read = (p: string) => readFileSync(p, 'utf8');

test('Part.obj is the unit cube in one group', () => {
  const m = parseObj(read('meshes/rtg-format/Part/Part.obj'));
  m.min.forEach((v) => expect(v).toBeCloseTo(-0.5, 5));
  m.max.forEach((v) => expect(v).toBeCloseTo(0.5, 5));
  expect(m.groups.map((g) => g.material)).toEqual(['Part1Mtl.003']);
  expect(m.indices.length).toBe(36);
});
test('Gate-AND keeps its three material groups in file order', () =>
  expect(
    parseObj(read('meshes/rtg-format/Gate-AND/Gate-AND.obj')).groups.map((g) => g.material),
  ).toEqual(['Handle1Mtl.017', 'Inputb1Mtl', 'Output1Mtl.001']));
test('every mesh bbox matches data/part_catalog.json within 1e-4', () => {
  const cat = JSON.parse(read('data/part_catalog.json')).parts;
  let n = 0;
  for (const p of Object.values<any>(cat)) {
    if (!p.mesh?.obj) continue;
    n++;
    const m = parseObj(read(p.mesh.obj));
    m.min.forEach((v, i) => expect(Math.abs(v - p.mesh.min[i])).toBeLessThan(1e-4));
    m.max.forEach((v, i) => expect(Math.abs(v - p.mesh.max[i])).toBeLessThan(1e-4));
  }
  expect(n).toBe(120);
});
test('quads are fan-triangulated and get a face normal', () => {
  const m = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n');
  expect([...m.indices]).toEqual([0, 1, 2, 0, 2, 3]);
  expect([...m.normals.slice(0, 3)]).toEqual([0, 0, 1]);
});
// Added beyond the brief: negative indices and the v//vn corner form have no coverage otherwise.
test('negative indices count back from the last vertex', () =>
  expect([...parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf -3 -2 -1\n').indices]).toEqual([0, 1, 2]));
test('v//vn corners keep the file normal', () =>
  expect([...parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 -1\nf 1//1 2//1 3//1\n').normals]).toEqual(
    [0, 0, -1, 0, 0, -1, 0, 0, -1],
  ));
test('an index past the last vertex throws', () =>
  expect(() => parseObj('v 0 0 0\nf 1 2 3\n')).toThrow(/out of range/));
test('a zero file normal falls back to the face normal', () =>
  expect([
    ...parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvn -0 -0 -0\nf 1//1 2//1 3//1\n').normals,
  ]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]));

test('UV seams split vertices while preserving file normals and bounds', () => {
  const m = parseObj(`v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vt 0.5 0.5
vn 0 0 -1
f 1/1/1 2/2/1 3/3/1
f 1/4/1 3/3/1 2/2/1
`);
  expect([...m.indices]).toEqual([0, 1, 2, 3, 2, 1]);
  expect([...m.uvs!]).toEqual([0, 0, 1, 0, 0, 1, 0.5, 0.5]);
  expect([...m.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]);
  expect([...m.normals]).toEqual([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]);
  expect(m.min).toEqual([0, 0, 0]);
  expect(m.max).toEqual([1, 1, 0]);
});

test('negative texture and normal indices resolve at the face declaration', () => {
  const m = parseObj(`v 0 0 0
v 1 0 0
v 0 1 0
vt 0.25 0.75
vt 1 0
vt 0 1
vn 0 0 1
f -3/-3/-1 -2/-2/-1 -1/-1/-1
vt 9 9
vn 0 1 0
`);
  expect([...m.uvs!]).toEqual([0.25, 0.75, 1, 0, 0, 1]);
  expect([...m.normals]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

test('texture indices outside the defined coordinates throw', () => {
  expect(() => parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/2 2/1 3/1')).toThrow(
    /texture index.*out of range/,
  );
});

test('object and group names split runs without losing the active material', () => {
  const m = parseObj(`v 0 0 0
v 1 0 0
v 0 1 0
o Shell
usemtl Shared
f 1 2 3
g Handle
f 1 2 3
usemtl Detail
f 1 2 3
`);
  expect(m.groups).toEqual([
    { name: 'Shell', material: 'Shared', start: 0, count: 3 },
    { name: 'Handle', material: 'Shared', start: 3, count: 3 },
    { name: 'Handle', material: 'Detail', start: 6, count: 3 },
  ]);
});
