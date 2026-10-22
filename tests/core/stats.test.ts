import { expect, test } from 'vitest';
import { buildStats } from '../../src/core/stats';
import { codeSize } from '../../src/core/size';
import { docOf, part, mount, pt } from '../helpers/doc';
test('counts, percents, and point bytes moved to the mounted child', () => {
  const d = docOf(
    part(1, 'Connector', [], {}, [pt('{a}'), pt('{b}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part'),
  );
  const s = buildStats(d);
  expect(s).toMatchObject({ parts: 3, joints: 1, points: 2, roots: 2 });
  expect(s.types.map((t) => [t.type, t.count, t.partsPercent.toFixed(2)])).toEqual([
    ['Part', 2, '66.67'],
    ['Connector', 1, '33.33'],
  ]);
  expect(s.types.reduce((a, t) => a + t.codeBytes, 0) + 2 + 2).toBe(codeSize(d).jsonBytes);
});
