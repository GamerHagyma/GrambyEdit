import {
  defaultChildSocket,
  eligibleForPoint,
  eligibleForSocket,
  newPartProps,
} from '../../src/core/defaults';
import { MINI } from '../helpers/catalog';
import { realCatalog } from '../helpers/real-catalog';

test('corpus pairs pick the attaching socket', async () => {
  const cat = await realCatalog();
  expect(defaultChildSocket(cat, 'Splitter_2', 'Switch', '2')).toBe('3');
  expect(defaultChildSocket(cat, 'Part', 'Part', '6')).toBe('1');
});
test('without corpus data, the role complement decides', () =>
  expect(defaultChildSocket({ ...MINI, pairs: {} }, 'Switch', 'Gate-AND', '2')).toBe('1'));
test('then the default mount, then the first child socket, then nothing', () => {
  const cat = { ...MINI, pairs: {} };
  // An unknown parent has no role to complement.
  expect(defaultChildSocket(cat, 'Part', 'Nope', '1')).toBe(cat.parts.Part.defaultMount);
  expect(defaultChildSocket(cat, 'Nope', 'Part', '6')).toBeNull();
});
test('eligibility and auto-color props', () => {
  expect(eligibleForSocket(MINI, 'Chassis')).toBe(false);
  expect(eligibleForPoint(MINI, 'Mag')).toBe(true);
  expect(newPartProps(MINI, 'Part', { autoColor: true, activeColor: [1, 2, 3] })).toEqual({
    RGB: [1, 2, 3],
  });
  expect(newPartProps(MINI, 'Mag', { autoColor: true, activeColor: [1, 2, 3] })).toEqual({});
  expect(newPartProps(MINI, 'Part', { autoColor: false, activeColor: [1, 2, 3] })).toEqual({});
});

test.each(['Servo', 'Servo_Physics'])('%s spawns with confirmed servo defaults', async (type) => {
  const cat = await realCatalog();
  expect(newPartProps(cat, type, { autoColor: false, activeColor: [1, 2, 3] })).toEqual({
    Speed: 45,
    LimitAngle: 45,
    Rotation: 0,
    Rest: true,
    LimitEnabled: true,
  });
});
