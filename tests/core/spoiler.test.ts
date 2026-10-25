import { Vector3 } from 'three';
import { realCatalog } from '../helpers/real-catalog';
import { docOf, part, sock } from '../helpers/doc';
import { computePoses, childSocketMatrix, socketMatrix } from '../../src/core/pose';
import { canBeParent, canBeChild, validate } from '../../src/core/rules';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { SocketsLayer } from '../../src/viewport/sockets-layer';
import { CameraRig } from '../../src/viewport/cameras/rig';
import { fromEntries, toEntries } from '../../src/core/doc';
test('Spoiler shares native ID 2 across independent bottom and top attachment frames', async () => {
  const cat = await realCatalog(),
    doc = docOf(part(1, 'Part'), part(2, 'Spoiler', [sock('2', 1, '6')])),
    poses = computePoses(doc, cat, cat.conventions);
  expect(canBeParent(doc, cat, 2, '2').ok).toBe(true);
  const withChild = docOf(...doc.parts.values(), part(3, 'Part', [sock('1', 2, '2')]));
  expect(validate(withChild, cat, DEFAULT_LIMITS, 0).filter((i) => i.severity === 'error')).toEqual(
    [],
  );
  const top = socketMatrix(cat, 'Spoiler', '2').m,
    bottom = childSocketMatrix(cat, 'Spoiler', '2', 'point').m;
  expect(top.elements[13] - bottom.elements[13]).toBeCloseTo(0.4753451943);
  const landed = new Vector3().setFromMatrixPosition(poses.world.get(2)!.clone().multiply(bottom));
  expect(landed.y).toBeCloseTo(0.5);
  const rig = new CameraRig();
  rig.setSize(800, 600);
  const layer = new SocketsLayer();
  layer.update(doc, poses, cat, [2], rig, 100);
  expect(layer.shown().filter((s) => s.part === 2 && s.socket === '2')).toHaveLength(2);
  layer.dispose();
  const topUsed = docOf(part(1, 'Part'), part(2, 'Spoiler'), part(3, 'Part', [sock('1', 2, '2')]));
  expect(canBeChild(topUsed, cat, 2, '2', 'joint').ok).toBe(true);
});
test('the user’s in-game Connector / Spoiler / Connector export seats both native ID2 attachments', async () => {
  const entries = JSON.parse(
    '[["Connector",[],[]],["Connector",[["5","2",3]],[]],["Spoiler",[["2","4",1]],[]]]',
  );
  const loaded = fromEntries(entries);
  if (!loaded.ok) throw new Error(loaded.error.reason);
  const cat = await realCatalog(),
    doc = loaded.doc,
    poses = computePoses(doc, cat, cat.conventions);
  const bottom = new Vector3().setFromMatrixPosition(
    poses.world
      .get(3)!
      .clone()
      .multiply(childSocketMatrix(cat, 'Spoiler', '2', 'point').m),
  );
  const rootCup = new Vector3().setFromMatrixPosition(
    poses.world
      .get(1)!
      .clone()
      .multiply(socketMatrix(cat, 'Connector', '4').m),
  );
  const top = new Vector3().setFromMatrixPosition(
    poses.world
      .get(3)!
      .clone()
      .multiply(socketMatrix(cat, 'Spoiler', '2').m),
  );
  const upperBall = new Vector3().setFromMatrixPosition(
    poses.world
      .get(2)!
      .clone()
      .multiply(childSocketMatrix(cat, 'Connector', '5', 'point').m),
  );
  expect(bottom.distanceTo(rootCup)).toBeLessThan(1e-6);
  expect(top.distanceTo(upperBall)).toBeLessThan(1e-6);
  expect(toEntries(doc)).toEqual(entries);
  expect(validate(doc, cat, DEFAULT_LIMITS, 0).filter((i) => i.severity === 'error')).toEqual([]);
});
