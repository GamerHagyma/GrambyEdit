import { Matrix4, Vector3 } from 'three';
import { DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { mountSubDoc } from '../../src/core/generators';
import { previewOnHost } from '../../src/state/preview';
import { MINI } from '../helpers/catalog';

test('a preview on a host moves every element with the host and leaves the host out', () => {
  const frames = [1, 2].map((x) => new Matrix4().makeTranslation(x, 0, 0));
  const sub = mountSubDoc(
    MINI,
    C,
    { type: 'Connector', partName: 'Connector' },
    { type: 'Part', mount: '1' },
    frames,
    null,
    { pos: 4, rot: 5 },
  );
  const p = previewOnHost(sub, MINI, new Matrix4().makeTranslation(10, 0, 0));
  expect(p.doc.order).toEqual([2, 3]);
  expect(p.doc.parts.has(1)).toBe(false);
  expect(p.poses.world.has(1)).toBe(false);
  expect(new Vector3().setFromMatrixPosition(p.poses.world.get(2)!).x).toBeCloseTo(11, 4);
  expect(new Vector3().setFromMatrixPosition(p.poses.world.get(3)!).x).toBeCloseTo(12, 4);
});
