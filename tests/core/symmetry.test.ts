import { Matrix4, Vector3 } from 'three';
import {
  symmetryFrame,
  symmetryTransforms,
  copyFrame,
  reflectedSocket,
} from '../../src/core/symmetry';
import { MINI } from '../helpers/catalog';

test('an offset and rotated anchor defines an arbitrary world mirror plane', () => {
  const frame = symmetryFrame(new Matrix4().makeTranslation(5, 2, 3), 'x', 2, [0, 0, 0]);
  const [transform] = symmetryTransforms(frame, 'plane', 'x', 4);
  expect(new Vector3(9, 6, 8).applyMatrix4(transform).toArray()).toEqual([5, 6, 8]);
  const world = copyFrame(transform, new Matrix4().makeTranslation(9, 6, 8), 'Part');
  expect(world.determinant()).toBeCloseTo(1);
  expect(new Vector3().setFromMatrixPosition(world).toArray()).toEqual([5, 6, 8]);
  const turned = symmetryFrame(new Matrix4().makeTranslation(5, 2, 3), 'x', 2, [0, 90, 0]);
  const [reflection] = symmetryTransforms(turned, 'plane', 'x', 4);
  const landed = new Vector3(9, 6, 5).applyMatrix4(reflection);
  expect(landed.x).toBeCloseTo(9);
  expect(landed.y).toBeCloseTo(6);
  expect(landed.z).toBeCloseTo(-3);
});
test('radial sectors include the original only once and preserve proper rotations', () => {
  const transforms = symmetryTransforms(new Matrix4(), 'radial', 'y', 4);
  expect(transforms).toHaveLength(3);
  const positions = transforms.map((m) => new Vector3(2, 0, 0).applyMatrix4(m));
  expect(positions[0].x).toBeCloseTo(0);
  expect(positions[0].z).toBeCloseTo(-2);
  expect(positions[1].x).toBeCloseTo(-2);
  expect(transforms.every((m) => Math.abs(m.determinant() - 1) < 1e-8)).toBe(true);
  expect(() => symmetryTransforms(new Matrix4(), 'radial', 'y', 1)).toThrow();
});
test('native socket reflection swaps the opposite faces while keeping the mount', () => {
  expect(reflectedSocket(MINI, 'Part', '2')).toBe('3');
  expect(reflectedSocket(MINI, 'Part', '1')).toBe('1');
});
