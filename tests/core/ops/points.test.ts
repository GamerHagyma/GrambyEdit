import { transact } from '../../../src/core/ops/transact';
import { addPoint, deletePoint, setPointCFrame } from '../../../src/core/ops/points';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS } from '../../../src/core/conventions';
import { matrix4ToCf } from '../../../src/core/cframe';
import { isUuid } from '../../../src/core/uuid';
import { docOf, part, sock, mount, pt } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import type { CFrame12 } from '../../../src/core/types';

const ID: CFrame12 = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
const MOVED: CFrame12 = [5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

test('deleting a point with a child: detach keeps the child where it was', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', [2, 0.25, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
  );
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  const { doc } = transact(d0, 'x', (d) => deletePoint(d, 1, '{a}', 'detach', poses));
  expect(doc.parts.get(2)!.conns).toEqual([]);
  expect(doc.layout.get(2)).toEqual(matrix4ToCf(poses.world.get(2)!));
  expect(doc.parts.get(1)!.points!.size).toBe(0);
});

test('deletePoint with delete removes the child, and the point with it', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  const poses = computePoses(d0, MINI, DEFAULT_CONVENTIONS);
  const { doc } = transact(d0, 'x', (d) => deletePoint(d, 1, '{a}', 'delete', poses));
  expect(doc.order).toEqual([1, 3]);
  expect(doc.parts.get(3)!.conns).toEqual([]);
  expect(doc.layout.get(3)).toEqual(matrix4ToCf(poses.world.get(3)!));
  expect(doc.parts.get(1)!.points!.size).toBe(0);
});

test('addPoint mints a braced uuid, creates the points map when it is null, and keeps a given uuid', () => {
  let minted = '';
  const { doc } = transact(docOf(part(1, 'Base')), 'x', (d) => {
    minted = addPoint(d, 1, ID, 'Base');
    addPoint(d, 1, ID, 'Base', '{fixed}');
  });
  expect(isUuid(minted)).toBe(true);
  expect([...doc.parts.get(1)!.points!.keys()]).toEqual([minted, '{fixed}']);
});

test('setPointCFrame moves one point and keeps its name; a missing point throws', () => {
  const d0 = docOf(part(1, 'Base', [], {}, [pt('{a}', ID, 'Base'), pt('{b}')]));
  const { doc } = transact(d0, 'x', (d) => setPointCFrame(d, 1, '{a}', MOVED));
  expect(doc.parts.get(1)!.points!.get('{a}')).toEqual({
    uuid: '{a}',
    partName: 'Base',
    cframe: MOVED,
  });
  expect(doc.parts.get(1)!.points!.get('{b}')).toBe(d0.parts.get(1)!.points!.get('{b}'));
  expect(() => transact(d0, 'x', (d) => setPointCFrame(d, 1, '{zz}', MOVED))).toThrow();
});
