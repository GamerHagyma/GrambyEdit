import { Matrix4, Vector3 } from 'three';
import { cfToMatrix4 } from '../../src/core/cframe';
import { computePoses, SPRING_DROP } from '../../src/core/pose';
import type { PartId } from '../../src/core/types';
import { SpringsLayer } from '../../src/viewport/springs-layer';
import { docOf, part, sock } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';

const matrixAt = (layer: SpringsLayer, i: number) => {
  const m = new Matrix4();
  layer.mesh.getMatrixAt(i, m);
  return m;
};

test('a coil hangs from each wheel socket with a part on it, down to that part', async () => {
  const cat = await realCatalog();
  const doc = docOf(
    part(1, 'Chassis'),
    part(2, 'Bearing', [sock('1', 1, '1')]),
    part(3, 'Bearing', [sock('1', 1, '4')]),
    // The steering socket has no spring.
    part(4, 'Bearing', [sock('1', 1, '10')]),
  );
  const poses = computePoses(doc, cat, cat.conventions);
  const layer = new SpringsLayer();
  layer.sync(doc, poses, new Set(), cat);
  expect(layer.mesh.count).toBe(2);
  // Each coil sits at its socket on the base, turned with the base, so it hangs along the base's -Y.
  ['1', '4'].forEach((socket, i) => {
    const at = new Vector3().setFromMatrixPosition(
      cfToMatrix4(cat.parts.Chassis.sockets[socket].frame),
    );
    const want = poses.world.get(1)!.clone().multiply(new Matrix4().makeTranslation(at));
    matrixAt(layer, i).elements.forEach((v, k) => expect(v).toBeCloseTo(want.elements[k], 9));
  });
  layer.mesh.geometry.computeBoundingBox();
  const box = layer.mesh.geometry.boundingBox!;
  expect(box.max.y).toBeCloseTo(0, 1);
  expect(box.min.y).toBeCloseTo(-SPRING_DROP, 1);
  // A hidden part, or a hidden base, hangs no coil.
  layer.sync(doc, poses, new Set<PartId>([2]), cat);
  expect(layer.mesh.count).toBe(1);
  layer.sync(doc, poses, new Set<PartId>([1]), cat);
  expect(layer.mesh.count).toBe(0);
  layer.dispose();
});

test('the coils grow past the first few: three cars of four wheels', async () => {
  const cat = await realCatalog();
  const parts = [1, 2, 3].flatMap((car) => {
    const base = car * 10;
    return [
      part(base, 'Chassis'),
      ...['1', '4', '5', '6'].map((s, i) => part(base + i + 1, 'Bearing', [sock('1', base, s)])),
    ];
  });
  const doc = docOf(...parts);
  const layer = new SpringsLayer();
  layer.sync(doc, computePoses(doc, cat, cat.conventions), new Set(), cat);
  expect(layer.mesh.count).toBe(12);
  layer.dispose();
});
