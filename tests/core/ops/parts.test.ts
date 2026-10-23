import { transact } from '../../../src/core/ops/transact';
import { addPart, deleteParts } from '../../../src/core/ops/parts';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS } from '../../../src/core/conventions';
import { matrix4ToCf } from '../../../src/core/cframe';
import { docOf, part, sock, mount, pt } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';

test('deleting a parent promotes a non-cycling secondary joint or loosens the child', () => {
  const d0 = docOf(
    part(1, 'Gate-AND'),
    part(2, 'Gate-AND'),
    part(3, 'Wire', [sock('1', 1, '1'), sock('3', 2, '2')]),
    part(4, 'Part'),
    part(5, 'Part', [sock('1', 4, '6')]),
  );
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  let res: any;
  const { doc } = transact(d0, 'del', (d) => {
    res = deleteParts(d, [1, 4], poses);
  });
  expect(doc.parts.get(3)!.conns).toEqual([sock('3', 2, '2')]);
  expect(res).toEqual({ reposed: [3], loosened: [5] });
  expect(doc.layout.get(5)).toEqual(matrix4ToCf(poses.world.get(5)!));
});

test('a promotion that would close a loop is skipped: the part stays posed through it', () => {
  // Part 2 hangs from the doomed part 1 (pose) and carries a secondary joint to part 3, which hangs from 2.
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Splitter_2', [sock('5', 1, '6'), sock('3', 3, '2')]),
    part(3, 'Part', [sock('1', 2, '4')]),
  );
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  let res: any;
  const { doc } = transact(d0, 'del', (d) => {
    res = deleteParts(d, [1], poses);
  });
  expect(doc.parts.get(2)!.conns).toEqual([sock('3', 3, '2')]);
  expect(res).toEqual({ reposed: [2], loosened: [] });
  expect(doc.layout.has(2)).toBe(false);
});

test('deleting a mounted part removes its point; unused points survive', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}'), pt('{b}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
  );
  const { doc } = transact(d0, 'del', (d) =>
    deleteParts(d, [2], computePoses(d0, MINI, DEFAULT_CONVENTIONS)),
  );
  expect([...doc.parts.get(1)!.points!.keys()]).toEqual(['{b}']);
});

test('addPart appends a part with a fresh id, and keeps the given props', () => {
  let id = 0;
  const { doc } = transact(docOf(part(1, 'Part')), 'add', (d) => {
    id = addPart(d, 'Light', { Activated: true });
  });
  expect(id).toBe(2);
  expect(doc.order).toEqual([1, 2]);
  expect(doc.parts.get(2)).toEqual({
    id: 2,
    type: 'Light',
    conns: [],
    props: { Activated: true },
    points: null,
  });
  expect(doc.nextId).toBe(3);
});
