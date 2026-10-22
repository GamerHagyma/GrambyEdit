import { subPartName } from '../../scripts/lib/names';

test.each([
  ['Glass1Mtl.004', 'Roof', 'Glass'],
  ['Door1Mtl.007', 'Trunk', 'Door'],
  ['Base1Mtl', 'Base', 'Base'],
  ['Longstick1Mtl', 'LongStick', 'LongStick'],
  ['Output21Mtl.001', 'Splitter_2', 'Output2'],
  ['Handle1Mtl.017', 'Gate-AND', 'Handle'],
])('subPartName(%s, %s) = %s', (m, t, want) => expect(subPartName(m, t)).toBe(want));
