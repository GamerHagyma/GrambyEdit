import {
  buildPalette,
  hexToRgb,
  partsWithColor,
  pushRecentColor,
  rgbToHex,
} from '../../src/core/palette';
import type { RGB } from '../../src/core/types';
import { docOf, part } from '../helpers/doc';

test('palette and hex helpers', () => {
  const d = docOf(
    part(1, 'Part', [], { RGB: [198, 40, 40] }),
    part(2, 'Part', [], { RGB: [198, 40, 40] }),
    part(3, 'Part', [], { RGB: [0, 0, 0] }),
  );
  expect(buildPalette(d)).toEqual([
    { rgb: [198, 40, 40], count: 2 },
    { rgb: [0, 0, 0], count: 1 },
  ]);
  expect(rgbToHex([198, 40, 40])).toBe('#c62828');
  expect(hexToRgb('#C62828')).toEqual([198, 40, 40]);
  expect(hexToRgb('nope')).toBeNull();
});

test('hex accepts a missing # and rejects short or long text', () => {
  expect(hexToRgb('c62828')).toEqual([198, 40, 40]);
  expect(hexToRgb('#c6282')).toBeNull();
  expect(hexToRgb('#c628280')).toBeNull();
});

test('the palette ignores props that are not RGB triples', () => {
  const d = docOf(
    part(1, 'Part', [], { RGB: [1, 2] }),
    part(2, 'Part', [], { RGB: 'red' }),
    part(3, 'Part', [], { RGB: [1, 2, 300] }),
    part(4, 'Part'),
  );
  expect(buildPalette(d)).toEqual([]);
});

test('partsWithColor lists the parts of one color in export order', () => {
  const d = docOf(
    part(1, 'Part', [], { RGB: [1, 2, 3] }),
    part(2, 'Gate-AND'),
    part(3, 'Part', [], { RGB: [1, 2, 3] }),
  );
  expect(partsWithColor(d, [1, 2, 3])).toEqual([1, 3]);
});

test('recent colors are unique, newest first and capped at 12', () => {
  let list: RGB[] = [];
  for (let i = 0; i < 14; i++) list = pushRecentColor(list, [i, 0, 0]);
  expect(list).toHaveLength(12);
  expect(list[0]).toEqual([13, 0, 0]);
  expect(
    pushRecentColor(
      [
        [1, 0, 0],
        [2, 0, 0],
      ],
      [2, 0, 0],
    ),
  ).toEqual([
    [2, 0, 0],
    [1, 0, 0],
  ]);
});
