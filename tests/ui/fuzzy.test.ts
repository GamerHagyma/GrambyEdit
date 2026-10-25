import { fuzzyScore, partScore } from '../../src/ui/widgets/fuzzy';
import { realCatalog } from '../helpers/real-catalog';
test('fuzzy matching', () => {
  expect(
    ['Gate-AND', 'Gate-OR', 'Gate-NOT', 'Part'].filter((t) => fuzzyScore('gate', t) > 0),
  ).toEqual(['Gate-AND', 'Gate-OR', 'Gate-NOT']);
  expect(fuzzyScore('conb', 'ConnectorBall')).toBeGreaterThan(0);
  expect(fuzzyScore('gate', 'Gate-AND')).toBeGreaterThan(fuzzyScore('gate', 'MatchingGyro'));
});
test('Spinner searches find native Bearing without changing its exported type', async () => {
  const cat = await realCatalog(),
    bearing = cat.parts.Bearing;
  expect(partScore(bearing, 'Spinner')).toBeGreaterThan(0);
  expect(partScore(bearing, 'Bearing')).toBeGreaterThan(0);
  expect(bearing.type).toBe('Bearing');
});
test('the empty query matches, case is ignored, and prefixes rank above mid-word hits', () => {
  expect(fuzzyScore('  ', 'Anything')).toBeGreaterThan(0);
  expect(fuzzyScore('GATE', 'gate-and')).toBe(fuzzyScore('gate', 'Gate-AND'));
  expect(fuzzyScore('gate', 'Gate')).toBeGreaterThan(fuzzyScore('gate', 'Investigate'));
});
