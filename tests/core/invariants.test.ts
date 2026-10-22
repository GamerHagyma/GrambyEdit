import { checkInvariants } from '../../src/core/invariants';
import { docOf, part, sock } from '../helpers/doc';
test('flags dangling targets; clean docs pass', () => {
  expect(checkInvariants(docOf(part(1, 'Part', [sock('1', 9, '6')])))).toEqual([
    'I2: part 1 conn 0 targets missing part 9',
  ]);
  expect(checkInvariants(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])))).toEqual([]);
});
