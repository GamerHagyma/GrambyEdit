import { fuzzyScore } from '../../src/ui/widgets/fuzzy';
test('fuzzy matching', () => {
  expect(
    ['Gate-AND', 'Gate-OR', 'Gate-NOT', 'Part'].filter((t) => fuzzyScore('gate', t) > 0),
  ).toEqual(['Gate-AND', 'Gate-OR', 'Gate-NOT']);
  expect(fuzzyScore('conb', 'ConnectorBall')).toBeGreaterThan(0);
  expect(fuzzyScore('gate', 'Gate-AND')).toBeGreaterThan(fuzzyScore('gate', 'MatchingGyro'));
});
test('the empty query matches, case is ignored, and prefixes rank above mid-word hits', () => {
  expect(fuzzyScore('  ', 'Anything')).toBeGreaterThan(0);
  expect(fuzzyScore('GATE', 'gate-and')).toBe(fuzzyScore('gate', 'Gate-AND'));
  expect(fuzzyScore('gate', 'Gate')).toBeGreaterThan(fuzzyScore('gate', 'Investigate'));
});
