import { Matrix4, Quaternion, Vector3 } from 'three';
import { DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { transact } from '../../src/core/ops/transact';
import { computePoses } from '../../src/core/pose';
import {
  applyTransform,
  constrainDelta,
  deltaMatrix,
  gridOffset,
  pivotOf,
  snapValue,
} from '../../src/tools/transform';
import { MINI } from '../helpers/catalog';
import { realCatalog } from '../helpers/real-catalog';
import { docOf, mount, part, pt, sock } from '../helpers/doc';

const same = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 9));

test('pivot, snapping and axis constraints', () => {
  const poses = {
    world: new Map([
      [1, new Matrix4().makeTranslation(0, 0, 0)],
      [2, new Matrix4().makeTranslation(2, 0, 0)],
      [3, new Matrix4().makeTranslation(4, 3, 0)],
    ]),
    flags: new Map(),
    approxCount: 0,
  };
  expect(pivotOf(poses, [1, 2, 3], 'median', null).toArray()).toEqual([2, 1, 0]);
  expect(pivotOf(poses, [1, 2, 3], 'active', 3).toArray()).toEqual([4, 3, 0]);
  expect([snapValue(0.37, 0.25), snapValue(0.38, 0.25), snapValue(-0.38, 0.25)]).toEqual([
    0.25, 0.5, -0.5,
  ]);
  expect(constrainDelta(new Vector3(1, 2, 3), 'Y').toArray()).toEqual([0, 2, 0]);
});

test('snapping leaves no float noise and no negative zero', () => {
  expect(snapValue(0.29, 0.1)).toBe(0.3);
  expect(Object.is(snapValue(-0.01, 0.25), 0)).toBe(true);
  expect(snapValue(0.3, 0)).toBe(0.3);
});

test('a rotation turns about the pivot, or about each origin for individual origins', () => {
  const quarter = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const at = (v: Vector3, m: Matrix4) =>
    v
      .clone()
      .applyMatrix4(m)
      .toArray()
      .map((x) => +x.toFixed(9) + 0);
  const aboutPivot = deltaMatrix(
    { kind: 'rotate', rotation: quarter, pivot: new Vector3(1, 0, 0) },
    new Vector3(3, 0, 0),
  );
  expect(at(new Vector3(3, 0, 0), aboutPivot)).toEqual([1, 0, -2]);
  const individual = deltaMatrix(
    { kind: 'rotate', rotation: quarter, pivot: 'individual' },
    new Vector3(3, 0, 0),
  );
  expect(at(new Vector3(3, 0, 0), individual)).toEqual([3, 0, 0]);
  const move = deltaMatrix({ kind: 'move', offset: new Vector3(0, 0, 5) }, new Vector3(3, 0, 0));
  expect(at(new Vector3(3, 0, 0), move)).toEqual([3, 0, 5]);
});

test('applyTransform moves topmost parts through points or layout and lists refusals', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', undefined, 'Base')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part', [sock('1', 2, '6')]),
    part(4, 'Gate-AND'),
    part(5, 'Light', [sock('1', 4, '1')]),
    part(6, 'Part'),
  );
  const poses = computePoses(d0, MINI, C);
  const shift = new Matrix4().makeTranslation(2, 0, 0);
  let refused: string[] = [];
  const { doc } = transact(d0, 'Move 3 parts', (d) => {
    refused = applyTransform(d, MINI, C, poses, [2, 5, 6], () => shift);
  });
  const after = computePoses(doc, MINI, C);
  for (const id of [2, 3, 6])
    same(after.world.get(id)!, shift.clone().multiply(poses.world.get(id)!));
  same(after.world.get(5)!, poses.world.get(5)!);
  expect(refused).toEqual([
    'Light #5 has no free connection point to mount on without breaking its joint to Gate-AND #4. Detach it first to move it freely.',
  ]);
});

test('a socket-joined part is converted to a point mount without jumping', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  const poses = computePoses(d0, MINI, C);
  const { doc } = transact(d0, 'Move 1 part', (d) => {
    applyTransform(d, MINI, C, poses, [2], () => new Matrix4());
  });
  expect(doc.parts.get(2)!.conns[0].target.kind).toBe('point');
  same(computePoses(doc, MINI, C).world.get(2)!, poses.world.get(2)!);
});

test('turning a socket-joined part keeps its joint and writes its Orientation, as the game does', () => {
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Gate-AND', [sock('4', 1, '6')], { OrientationX: 1080 }),
  );
  const poses = computePoses(d0, MINI, C);
  const world = poses.world.get(2)!;
  const quarter = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
  const delta = deltaMatrix(
    { kind: 'rotate', rotation: quarter, pivot: 'individual' },
    new Vector3().setFromMatrixPosition(world),
  );
  const { doc } = transact(d0, 'Rotate 1 part', (d) => {
    applyTransform(d, MINI, C, poses, [2], () => delta);
  });
  const turned = doc.parts.get(2)!;
  expect(turned.conns).toEqual(d0.parts.get(2)!.conns);
  for (const k of ['OrientationX', 'OrientationY', 'OrientationZ']) {
    expect(Number.isFinite(Number(turned.props[k] ?? 0))).toBe(true);
  }
  const after = computePoses(doc, MINI, C).world.get(2)!;
  after.elements.forEach((v, i) =>
    expect(v).toBeCloseTo(delta.clone().multiply(world).elements[i], 4),
  );
});

test('grid snapping lands the moved point on the world grid on every axis (user, 2026-10-24)', () => {
  const from = new Vector3(0.3, 1.1, -0.2);
  const close = (v: Vector3, x: number, y: number, z: number) =>
    [v.x, v.y, v.z].forEach((c, i) => expect(c).toBeCloseTo([x, y, z][i], 9));
  // Along X: 0.9 lands on 1, and Y and Z join the grid too, at 1 and -0.25.
  close(gridOffset(new Vector3(0.6, 0, 0), from, 0.25), 0.7, -0.1, -0.05);
  // Without moving, the point still lands on the grid.
  close(gridOffset(new Vector3(), from, 0.25), -0.05, -0.1, -0.05);
});

test.each([
  ['Bearing', 'Wheel'],
  ['Servo_Physics', 'Wheel'],
  ['Roof', 'DoorA'],
  ['Roof', 'GasCap'],
])('turning %s-mounted %s is refused when the mount controls its turn', async (host, child) => {
  const cat = await realCatalog();
  const conv = cat.conventions;
  const d0 = docOf(part(1, host), part(2, child, [sock('1', 1, '2')]));
  const poses = computePoses(d0, cat, conv);
  const at = new Vector3().setFromMatrixPosition(poses.world.get(2)!);
  const turn = new Matrix4()
    .makeTranslation(at.x, at.y, at.z)
    .multiply(new Matrix4().makeRotationY(Math.PI / 2))
    .multiply(new Matrix4().makeTranslation(-at.x, -at.y, -at.z));
  let refused: string[] = [];
  const { doc } = transact(d0, 'Rotate 1 part', (d) => {
    refused = applyTransform(d, cat, conv, poses, [2], () => turn);
  });
  expect(refused).toEqual([
    `${child} #2 has a mount that controls its turn in game. Detach it before rotating it freely.`,
  ]);
  expect(doc.parts.get(2)).toEqual(d0.parts.get(2));
});
