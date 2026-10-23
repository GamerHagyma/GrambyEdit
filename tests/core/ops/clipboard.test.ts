import { duplicate, extractSubDoc, insertSubDoc } from '../../../src/core/ops/clipboard';
import { transact } from '../../../src/core/ops/transact';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { checkInvariants } from '../../../src/core/invariants';
import type { CFrame12, Conn, Doc, PartId } from '../../../src/core/types';
import { docOf, part, sock, mount, pt } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';

test('extract keeps internal joints and used points, drops outside joints', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}'), pt('{b}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  const sub = extractSubDoc(d0, computePoses(d0, MINI, C), [2, 3]);
  expect(sub.order).toEqual([1, 2]);
  expect(sub.parts.get(1)!.conns).toEqual([]);
  expect(sub.parts.get(2)!.conns).toEqual([sock('1', 1, '6')]);
  expect(sub.layout.get(1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('inserting a prefab twice gives fresh ids and fresh uuids', () => {
  const sub = docOf(part(1, 'Base', [], {}, [pt('{a}')]), part(2, 'Part', [mount('1', 1, '{a}')]));
  const d0 = docOf(part(1, 'Part'));
  const { doc } = transact(d0, 'ins', (d) => {
    insertSubDoc(d, MINI, C, computePoses(d0, MINI, C), sub, {
      root: [5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
    insertSubDoc(d, MINI, C, computePoses(d0, MINI, C), sub, {
      root: [9, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
  });
  const uuids = [...doc.parts.values()].flatMap((p) => [...(p.points?.keys() ?? [])]);
  expect(doc.order).toEqual([1, 2, 3, 4, 5]);
  expect(new Set(uuids).size).toBe(2);
  expect(uuids).not.toContain('{a}');
  expect(checkInvariants(doc)).toEqual([]);
});
test('duplicate keeps world poses and mounts copies on the same host', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  const poses = computePoses(d0, MINI, C);
  let ids: number[] = [];
  const { doc } = transact(d0, 'dup', (d) => {
    ids = duplicate(d, MINI, C, poses, [2]);
  });
  expect(doc.parts.get(ids[0])!.conns[0].target).toMatchObject({ kind: 'point', part: 1 });
  computePoses(doc, MINI, C)
    .world.get(ids[0])!
    .elements.forEach((v, i) => expect(v).toBeCloseTo(poses.world.get(2)!.elements[i], 9));
});
test('duplicating a point-mounted part with OrientationY keeps its world pose', () => {
  const yaw90: CFrame12 = [1, 0.25, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0];
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', yaw90, 'Base')]),
    part(2, 'Part', [mount('1', 1, '{a}')], { OrientationY: 90 }),
  );
  const poses = computePoses(d0, MINI, C);
  let ids: number[] = [];
  const { doc } = transact(d0, 'dup', (d) => {
    ids = duplicate(d, MINI, C, poses, [2]);
  });
  const copy = computePoses(doc, MINI, C).world.get(ids[0])!;
  copy.elements.forEach((v, i) => expect(v).toBeCloseTo(poses.world.get(2)!.elements[i], 9));
});
test('a part keeping only a raw self-joint is extracted as a root with that conn intact', () => {
  const selfJoint: Conn = { self: '1', target: { kind: 'raw', triple: ['1', '6', 2], self: true } };
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6'), selfJoint]));
  const sub = extractSubDoc(d0, computePoses(d0, MINI, C), [2]);
  expect(sub.parts.get(1)!.conns).toEqual([selfJoint]);
  expect(sub.layout.get(1)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  expect(checkInvariants(sub)).toEqual([]);
});
test('extract keeps only the points its internal mounts use', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', undefined, 'Base'), pt('{b}', undefined, 'Base')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
  );
  const sub = extractSubDoc(d0, computePoses(d0, MINI, C), [1, 2]);
  expect([...sub.parts.get(1)!.points!.keys()]).toEqual(['{a}']);
  expect(sub.parts.get(2)!.conns).toEqual([mount('1', 1, '{a}')]);
  expect(checkInvariants(sub)).toEqual([]);
});
test('a prefab attached to a point keeps a placed root where it is', () => {
  const d0: Doc = {
    ...docOf(part(1, 'Base', [], {}, [pt('{a}', [0, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Base')])),
    layout: new Map<PartId, CFrame12>([[1, [10, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]]]),
  };
  const { doc } = transact(d0, 'paste', (d) =>
    insertSubDoc(d, MINI, C, computePoses(d0, MINI, C), docOf(part(1, 'Part'), part(2, 'Part')), {
      target: { kind: 'point', part: 1, uuid: '{a}' },
    }),
  );
  const at = computePoses(doc, MINI, C).world.get(2)!.elements;
  expect(at[12]).toBeCloseTo(10, 9);
  expect(at[13]).toBeCloseTo(0.75, 9);
  expect(at[14]).toBeCloseTo(0, 9);
  expect(doc.layout.get(3)).toEqual([10, 0.75, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('a duplicated root keeps its world pose as its own layout', () => {
  const d0: Doc = {
    ...docOf(part(1, 'Part')),
    layout: new Map<PartId, CFrame12>([[1, [4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]]]),
  };
  let ids: number[] = [];
  const { doc } = transact(d0, 'dup', (d) => {
    ids = duplicate(d, MINI, C, computePoses(d0, MINI, C), [1]);
  });
  expect(doc.parts.get(ids[0])!.conns).toEqual([]);
  expect(doc.layout.get(ids[0])).toEqual([4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('a part posed from outside the selection keeps its secondary joint at its exact world pose', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', [0, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Base')]),
    part(2, 'Splitter_2', [mount('3', 1, '{a}'), sock('5', 3, '2')], { OrientationX: 90 }),
    part(3, 'Gate-AND'),
  );
  const poses = computePoses(d0, MINI, C);
  let ids: number[] = [];
  const { doc } = transact(d0, 'dup', (d) => {
    ids = duplicate(d, MINI, C, poses, [2, 3]);
  });
  const copy = doc.parts.get(ids[0])!;
  expect(copy.conns[0].target).toMatchObject({ kind: 'point', part: 1 });
  expect(copy.conns[1]).toEqual(sock('5', ids[1], '2'));
  expect(checkInvariants(doc)).toEqual([]);
  computePoses(doc, MINI, C)
    .world.get(ids[0])!
    .elements.forEach((v, i) => expect(v).toBeCloseTo(poses.world.get(2)!.elements[i], 9));
});
