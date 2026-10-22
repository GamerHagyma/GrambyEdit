import { expect, test } from 'vitest';
import { line } from '../../../src/core/generators/line';
import { grid } from '../../../src/core/generators/grid';
import { box } from '../../../src/core/generators/box';
import { ring } from '../../../src/core/generators/ring';
import { cylinder } from '../../../src/core/generators/cylinder';
import { sphere } from '../../../src/core/generators/sphere';
const run = (s: any, params: any, fill: any, orient: any = 'fixed', spacing = 1) =>
  s.generate({ params, fill, orient, spacing });
const yAxis = (cf: readonly number[]) => [cf[4], cf[7], cf[10]];

test('counts', () => {
  expect(run(line, { length: 10 }, 'solid')).toHaveLength(11);
  expect([
    run(grid, { width: 10, depth: 10 }, 'solid').length,
    run(grid, { width: 10, depth: 10 }, 'outline').length,
  ]).toEqual([121, 40]);
  expect(
    ['solid', 'shell', 'frame'].map((f) => run(box, { width: 2, height: 2, depth: 2 }, f).length),
  ).toEqual([27, 26, 20]);
  expect(run(ring, { radius: 5 }, 'outline')).toHaveLength(31);
  expect(run(cylinder, { radius: 1, height: 2 }, 'shell')).toHaveLength(18);
  expect(run(sphere, { radius: 2 }, 'shell')).toHaveLength(50);
});
test('line spans -5..5 and boxes rest on y = 0', () => {
  const l = run(line, { length: 10 }, 'solid');
  expect([l[0][0], l[10][0]]).toEqual([-5, 5]);
  expect(
    Math.min(...run(box, { width: 2, height: 2, depth: 2 }, 'solid').map((c: number[]) => c[1])),
  ).toBe(0);
});
test('outward orientation follows the radial normal', () => {
  const r = run(ring, { radius: 5 }, 'outline', 'outward');
  expect(r[0].slice(0, 3)).toEqual([5, 0, 0]);
  yAxis(r[0]).forEach((v, i) => expect(v).toBeCloseTo([1, 0, 0][i], 12));
  for (const cf of run(sphere, { radius: 2 }, 'shell', 'outward')) {
    const p = [cf[0], cf[1] - 2, cf[2]];
    expect(Math.hypot(...p)).toBeCloseTo(2, 9);
    yAxis(cf).forEach((v, i) => expect(v).toBeCloseTo(p[i] / 2, 9));
  }
});
