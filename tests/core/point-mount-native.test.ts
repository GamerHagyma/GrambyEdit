import { Matrix4, Vector3 } from 'three';
import capture from '../fixtures/rotation-probe-native.json';
import { cfToMatrix4, isCFrame12 } from '../../src/core/cframe';
import { childSocketMatrix, computePoses, ignoresOrientation } from '../../src/core/pose';
import { childWorldViaPoint } from '../../src/core/conventions';
import { duplicate } from '../../src/core/ops/clipboard';
import { makeFreeMovable, nativeRotate, setWorldPose } from '../../src/core/ops/move';
import { transact } from '../../src/core/ops/transact';
import { docOf, mount, part, pt, sock } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
import type { Json } from '../../src/core/types';

const frame = (v: readonly number[]) => {
  if (!isCFrame12(v)) throw new Error('Invalid measured CFrame.');
  return v;
};
const same = (a: Matrix4, b: Matrix4, tolerance = 1e-8) =>
  expect(Math.max(...a.elements.map((n, i) => Math.abs(n - b.elements[i])))).toBeLessThan(
    tolerance,
  );

test('door Orientation is ignored only for a known hinged child socket', async () => {
  const cat = await realCatalog();
  expect(ignoresOrientation(cat, 'Roof', '2', { type: 'DoorA', socket: '1' })).toBe(true);
  for (const type of ['Part', 'missing', 'constructor'])
    expect(ignoresOrientation(cat, 'Roof', '2', { type, socket: '1' })).toBe(false);
});

test.each(['DoorA', 'GasCap'])(
  '%s rotation commands leave a physical door mount unchanged',
  async (type) => {
    const cat = await realCatalog(),
      conv = cat.conventions;
    const doc = docOf(part(1, 'Roof'), part(2, type, [sock('1', 1, '2')]));
    const poses = computePoses(doc, cat, conv);
    const result = transact(doc, 'Rotate', (d) => nativeRotate(d, cat, conv, poses, 2, 'X', 90));
    expect(result.patch).toBeNull();
  },
);

test.each(capture.observations)('$type $case preserves the measured native mount', async (o) => {
  const cat = await realCatalog();
  const onPoint = 'point' in o && o.point;
  const hostType = onPoint ? capture.rootType : o.parentType!;
  const doc = docOf(
    part(
      1,
      hostType,
      [],
      {},
      onPoint ? [pt('probe', frame(onPoint), cat.parts[hostType].mainPartName)] : [],
    ),
    part(
      2,
      o.type,
      [onPoint ? mount(o.self, 1, 'probe') : sock(o.self, 1, o.parentSocket!)],
      o.props as Record<string, Json>,
    ),
  );
  const placed = {
    ...doc,
    layout: new Map([[1, frame(onPoint ? capture.rootWorld : o.parentWorld!)]]),
  };
  const actual = computePoses(placed, cat, cat.conventions).world.get(2)!;
  const native = cfToMatrix4(frame(o.nativeWorld));
  if ('freeAxis' in o && o.freeAxis) {
    // Bearing/physics-servo outputs can turn in game without an Orientation change.
    expect(
      new Vector3()
        .setFromMatrixPosition(actual)
        .distanceTo(new Vector3().setFromMatrixPosition(native)),
    ).toBeLessThan(0.001);
    expect(
      new Vector3()
        .setFromMatrixColumn(actual, 1)
        .distanceTo(new Vector3().setFromMatrixColumn(native, 1)),
    ).toBeLessThan(0.001);
  } else same(actual, native, 0.001);
});

test.each([false, true])(
  'point and socket tails remain distinct with point first = %s',
  async (pointFirst) => {
    const cat = await realCatalog();
    const onPoint = part(2, 'Servo_Physics', [mount('1', 1, 'probe')]);
    const onSocket = part(3, 'Servo_Physics', [sock('1', 1, '6')]);
    const doc = docOf(
      part(1, 'Part', [], {}, [pt('probe')]),
      ...(pointFirst ? [onPoint, onSocket] : [onSocket, onPoint]),
    );
    const poses = computePoses(doc, cat, cat.conventions);
    same(
      poses.world.get(2)!,
      cfToMatrix4([0.15000000596046448, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]),
    );
    same(poses.world.get(3)!, cfToMatrix4([0, 0.6500000059604645, 0, 0, 0, -1, -1, 0, 0, 0, 1, 0]));
  },
);

test.each(['Part', 'Bearing', 'Servo', 'Servo_Physics', 'DoorA', 'GasCap'])(
  '%s placement and inverse edits preserve the same native frame',
  async (type) => {
    const cat = await realCatalog(),
      conv = cat.conventions,
      self = cat.parts[type].defaultMount!;
    const base = docOf(
      part(1, 'Part'),
      part(2, type, [sock(self, 1, '6')], {
        OrientationX: 37,
        OrientationY: -23,
        OrientationZ: 61,
      }),
    );
    const poses = computePoses(base, cat, conv);
    const freed = transact(base, 'Free', (d) => {
      expect(makeFreeMovable(d, cat, conv, poses, 2).ok).toBe(true);
    }).doc;
    same(computePoses(freed, cat, conv).world.get(2)!, poses.world.get(2)!);
    const desired = new Matrix4().makeRotationY(0.41).setPosition(2, 3, -1);
    const moved = transact(freed, 'Move', (d) =>
      setWorldPose(d, cat, conv, computePoses(freed, cat, conv), 2, desired),
    ).doc;
    const movedPoses = computePoses(moved, cat, conv);
    same(movedPoses.world.get(2)!, desired);
    const c = moved.parts.get(2)!.conns[0];
    if (c.target.kind !== 'point') throw new Error('Expected free point mount.');
    const p = moved.parts.get(1)!.points!.get(c.target.uuid)!;
    const preview = childWorldViaPoint(
      new Matrix4(),
      new Matrix4(),
      cfToMatrix4(p.cframe),
      childSocketMatrix(cat, type, self, 'point').m,
      moved.parts.get(2)!.props,
      conv,
    );
    same(preview, desired);
    let copies: number[] = [];
    const copied = transact(moved, 'Copy', (d) => {
      copies = duplicate(d, cat, conv, movedPoses, [2]);
    }).doc;
    same(computePoses(copied, cat, conv).world.get(copies[0])!, desired);
  },
);
