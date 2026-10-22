import { line } from '../../../src/core/generators/line';
import { grid } from '../../../src/core/generators/grid';
import { box } from '../../../src/core/generators/box';
import { sphere } from '../../../src/core/generators/sphere';
import { ring } from '../../../src/core/generators/ring';
import { cone } from '../../../src/core/generators/cone';
import { cylinder } from '../../../src/core/generators/cylinder';
import { torus } from '../../../src/core/generators/torus';
import { arc } from '../../../src/core/generators/arc';
import { helix } from '../../../src/core/generators/helix';
import { stairs } from '../../../src/core/generators/stairs';
import { text } from '../../../src/core/generators/text';
import { GenerateLimitError, MAX_GENERATED } from '../../../src/core/generators/common';
import type { GenOrient, ShapeDef } from '../../../src/core/generators/types';

const ALL: ShapeDef[] = [
  line,
  grid,
  box,
  ring,
  cylinder,
  sphere,
  cone,
  torus,
  arc,
  helix,
  stairs,
  text,
];
const defaults = (s: ShapeDef) => Object.fromEntries(s.params.map((p) => [p.key, p.default]));
const run = (s: ShapeDef, spacing: number, params = defaults(s), orient: GenOrient = 'fixed') =>
  s.generate({ params, fill: s.fills[0], orient, spacing });

test('every shape returns nothing for zero, negative, tiny or non-finite spacing', () => {
  for (const s of ALL)
    for (const sp of [0, -1, 0.001, NaN, Infinity]) expect(run(s, sp), s.id).toEqual([]);
});
test('every orientation works on every shape; undefined pairs use the fixed rotation', () => {
  for (const s of ALL) {
    for (const o of ['fixed', 'outward', 'tangent'] as const)
      expect(run(s, 1, defaults(s), o).length, `${s.id} ${o}`).toBeGreaterThan(0);
  }
  expect(run(line, 1, { length: 2 }, 'outward')[0].slice(3)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('huge shapes stop at the cap instead of exhausting memory', () => {
  expect(() => run(line, 1, { length: 10 * MAX_GENERATED })).toThrow(GenerateLimitError);
  const t = performance.now();
  expect(() => run(sphere, 0.5, { radius: 1000 })).toThrow(GenerateLimitError);
  expect(() => s3(box, { width: 900, height: 900, depth: 900 })).toThrow(GenerateLimitError);
  expect(() =>
    ring.generate({ params: { radius: 150 }, fill: 'solid', orient: 'fixed', spacing: 0.01 }),
  ).toThrow(GenerateLimitError);
  expect(performance.now() - t).toBeLessThan(2000);
});
test('a frame box just under the cap scans its edges, not its volume', () => {
  const t = performance.now();
  const cfs = box.generate({
    params: { width: 80, height: 80, depth: 80 },
    fill: 'frame',
    orient: 'fixed',
    spacing: 0.01,
  });
  expect(cfs.length).toBe(12 * 7999 + 8);
  expect(performance.now() - t).toBeLessThan(3000);
});
const s3 = (s: ShapeDef, params: Record<string, number>) =>
  s.generate({ params, fill: 'frame', orient: 'fixed', spacing: 0.01 });
