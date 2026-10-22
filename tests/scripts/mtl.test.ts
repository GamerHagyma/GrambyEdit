import { readFileSync } from 'node:fs';
import { parseMtl } from '../../scripts/lib/mtl';

const read = (p: string) => readFileSync(p, 'utf8');

test('reads Kd per material', () =>
  expect(parseMtl(read('meshes/workshop/Gate-AND/Gate-AND.mtl')).Inputb1Mtl).toEqual([
    0.373615, 0.00552174, 0.00552174,
  ]));
