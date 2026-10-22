import { Matrix4, Vector3 } from 'three';
import { IDENTITY_CF, cfToMatrix4, matrix4ToCf, roundCf, isCFrame12 } from '../../src/core/cframe';
test('CFrame12 rows map onto Matrix4', () => {
  const cf = [0.5, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0] as const; // Part socket 2: local +Y -> world +X
  const m = cfToMatrix4(cf);
  expect(new Vector3(0, 1, 0).applyMatrix4(m).toArray()).toEqual([1.5, 0, 0]);
  expect(matrix4ToCf(m)).toEqual(cf);
  expect(matrix4ToCf(new Matrix4())).toEqual(IDENTITY_CF);
});
test('roundCf rounds and never writes -0', () => {
  const r = roundCf([1.234567, -0.00001, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 4, 5);
  expect(r.slice(0, 2)).toEqual([1.2346, 0]);
  expect(Object.is(r[1], 0)).toBe(true);
});
test('isCFrame12', () => {
  expect(isCFrame12(IDENTITY_CF)).toBe(true);
  expect(isCFrame12([0, 0, 0])).toBe(false);
  expect(isCFrame12([...IDENTITY_CF.slice(0, 11), NaN])).toBe(false);
});
