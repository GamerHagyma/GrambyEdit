import { cone } from '../../../src/core/generators/cone';
import { torus } from '../../../src/core/generators/torus';
import { arc } from '../../../src/core/generators/arc';
import { helix } from '../../../src/core/generators/helix';
import { stairs } from '../../../src/core/generators/stairs';
import { text, FONT_5X7 } from '../../../src/core/generators/text';

const run = (s: any, params: any, fill: any, orient: any = 'fixed', spacing = 1) =>
  s.generate({ params, fill, orient, spacing });
test('counts', () => {
  expect(run(cone, { radius: 2, height: 2, sides: 0 }, 'shell')).toHaveLength(20);
  expect(run(torus, { major: 3, minor: 1 }, 'shell')).toHaveLength(114);
  expect(run(arc, { radius: 5, angle: 90 }, 'outline')).toHaveLength(9);
  expect(run(helix, { radius: 1, height: 0, turns: 1 }, 'outline')).toHaveLength(7);
  expect(run(stairs, { steps: 3, rise: 1, run: 1, width: 2 }, 'solid')).toHaveLength(9);
  expect([
    run(text, { text: 'I' }, 'solid').length,
    run(text, { text: ' ' }, 'solid').length,
    run(text, { text: 'II' }, 'solid').length,
  ]).toEqual([15, 0, 30]);
});
test('font covers A–Z and 0–9 with 7 rows of 5', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
    expect(FONT_5X7[ch], ch).toHaveLength(7);
    FONT_5X7[ch].forEach((row) => expect(row).toMatch(/^[01]{5}$/));
  }
});
test('text is centred and advances six columns per character', () => {
  const xs = run(text, { text: 'II' }, 'solid').map((c: number[]) => c[0]);
  expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9);
  expect(Math.max(...xs) - Math.min(...xs)).toBe(10);
});
