import { readFileSync } from 'node:fs';
import { parseMtl, parseMtlOpacities, parseMtlTextures } from '../../scripts/lib/mtl';

const read = (p: string) => readFileSync(p, 'utf8');

test('reads Kd per material', () =>
  expect(parseMtl(read('meshes/workshop/Gate-AND/Gate-AND.mtl')).Inputb1Mtl).toEqual([
    0.373615, 0.00552174, 0.00552174,
  ]));

test('reads plain relative diffuse texture paths including spaces', () => {
  expect(
    parseMtlTextures('newmtl Shell\nmap_Kd textures/shell color.png\nnewmtl Plain\nKd 1 1 1'),
  ).toEqual({ Shell: 'textures/shell color.png' });
});

test('reads d and inverted Tr opacity, leaving unspecified materials absent', () => {
  expect(
    parseMtlOpacities(`d 0.1
newmtl Glass
d 0.25
newmtl Clear
Tr 1
newmtl Solid
Tr 0
newmtl Plain
Kd 1 1 1
newmtl Override
d 0.5
Tr 0.25
newmtl __proto__
d 0
`),
  ).toEqual({ Glass: 0.25, Clear: 0, Solid: 1, Override: 0.75, ['__proto__']: 0 });
});

test.each(['d nope', 'Tr NaN', 'd -0.1', 'Tr 1.1', 'd 0.5 0.5'])(
  'rejects malformed opacity: %s',
  (line) => {
    expect(() => parseMtlOpacities(`newmtl Glass\n${line}`)).toThrow(/bad opacity/);
  },
);
