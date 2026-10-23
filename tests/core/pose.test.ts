import { Matrix4, Vector3, Quaternion } from 'three';
import { computePoses, POSE_APPROX, POSE_CYCLE, POSE_UNKNOWN_TYPE } from '../../src/core/pose';
import { DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { docOf, part, sock, mount, pt, chainDoc } from '../helpers/doc';
import { MINI } from '../helpers/catalog';

const pos = (m: Matrix4) =>
  new Vector3()
    .setFromMatrixPosition(m)
    .toArray()
    .map((v) => +v.toFixed(9) + 0);
const axisY = (m: Matrix4) =>
  new Vector3(0, 1, 0)
    .transformDirection(m)
    .toArray()
    .map((v) => +v.toFixed(9) + 0);

test('Part on Part via 1→6 stacks one stud up, unrotated', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')])), MINI, C);
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
  expect(axisY(p.world.get(2)!)).toEqual([0, 1, 0]);
  expect(p.flags.get(2)).toBe(0);
});
test('Part on Part via 1→2 sits one stud along +X with its +Y facing +X', () => {
  const p = computePoses(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '2')])), MINI, C);
  expect(pos(p.world.get(2)!)).toEqual([1, 0, 0]);
  expect(axisY(p.world.get(2)!)).toEqual([1, 0, 0]);
});
test('a point mount seats the child socket on the point', () => {
  const d = docOf(
    part(1, 'Base', [], {}, [pt('{u}', [2, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Base')]),
    part(2, 'Part', [mount('1', 1, '{u}')]),
  );
  expect(pos(computePoses(d, MINI, C).world.get(2)!)).toEqual([2, 0.75, 0]);
});
test('OrientationY = 90 turns the child +90° about the parent socket normal', () => {
  const p = computePoses(
    docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')], { OrientationY: 90 })),
    MINI,
    C,
  );
  const q = new Quaternion().setFromRotationMatrix(p.world.get(2)!);
  expect(
    q.angleTo(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)),
  ).toBeLessThan(1e-9);
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
});
test('approximate frames flag the whole subtree', () => {
  const p = computePoses(
    docOf(
      part(1, 'Part'),
      part(2, 'Gate-AND', [sock('4', 1, '6')]),
      part(3, 'Light', [sock('1', 2, '1')]),
    ),
    MINI,
    C,
  );
  expect(p.flags.get(2)! & POSE_APPROX).toBeTruthy();
  expect(p.flags.get(3)! & POSE_APPROX).toBeTruthy();
});
test('cycles terminate with pseudo-roots', () => {
  const p = computePoses(
    docOf(part(1, 'Part', [sock('1', 2, '6')]), part(2, 'Part', [sock('1', 1, '6')])),
    MINI,
    C,
  );
  expect(p.world.size).toBe(2);
  expect(p.flags.get(2)! & POSE_CYCLE).toBeTruthy();
});
test('unknown types get a placeholder pose', () =>
  expect(
    computePoses(
      docOf(part(1, 'Part'), part(2, 'Mystery', [sock('1', 1, '6')])),
      MINI,
      C,
    ).flags.get(2)! & POSE_UNKNOWN_TYPE,
  ).toBeTruthy());
test('roots line up along +X with 2-stud gaps', () =>
  expect(pos(computePoses(docOf(part(1, 'Part'), part(2, 'Part')), MINI, C).world.get(2)!)).toEqual(
    [3, 0, 0],
  ));
test('a 16K chain computes in under 200 ms', () => {
  // Best of three: parallel test workers contend for the CPU; a real regression slows every run.
  const doc = chainDoc(16_000);
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    computePoses(doc, MINI, C);
    best = Math.min(best, performance.now() - t);
  }
  expect(best).toBeLessThan(200);
});
test('a raw first conn is skipped: the next socket conn poses the part', () => {
  const selfJoint = { self: '1', target: { kind: 'raw', triple: ['1', '6', 2] } } as const;
  const p = computePoses(
    docOf(part(1, 'Part'), part(2, 'Part', [selfJoint, sock('1', 1, '6')])),
    MINI,
    C,
  );
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
});
test('a point on a non-main sub-part without a captured frame is approximate', () => {
  const host = (partName: string) =>
    docOf(
      part(1, 'Roof', [], {}, [pt('{g}', undefined, partName)]),
      part(2, 'Part', [mount('1', 1, '{g}')]),
    );
  expect(computePoses(host('Roof'), MINI, C).flags.get(2)! & POSE_APPROX).toBe(0);
  expect(computePoses(host('Glass'), MINI, C).flags.get(2)! & POSE_APPROX).toBeTruthy();
});
test('an anchored loop island hangs from the build, not from a pseudo-root', () => {
  const d = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('3', 3, '2'), sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  const p = computePoses(d, MINI, C);
  expect(pos(p.world.get(2)!)).toEqual([0, 1, 0]);
  expect(pos(p.world.get(3)!)).toEqual([0, 2, 0]);
  expect(p.flags.get(3)! & POSE_CYCLE).toBe(0);
});
