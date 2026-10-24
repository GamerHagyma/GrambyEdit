import { Matrix4, Vector3 } from 'three';
import type { Poses } from '../../src/core/pose';
import type { PartId } from '../../src/core/types';
import { dragSocketParts } from '../../src/viewport/drag-sockets';
import { docOf, part } from '../helpers/doc';

// Parts 1–6 in a row along X, one stud apart.
const doc = docOf(...[1, 2, 3, 4, 5, 6].map((id) => part(id, 'Part')));
const poses: Poses = {
  world: new Map(doc.order.map((id) => [id, new Matrix4().makeTranslation(id, 0, 0)])),
  flags: new Map(),
  approxCount: 0,
};
const drag = (point: number, near: PartId | null, moving: PartId[] = []) => ({
  point: new Vector3(point, 0, 0),
  near,
  moving: new Set(moving),
});

test('the hovered part comes first, then the last hovered one, then the parts nearest the drag', () => {
  expect(dragSocketParts(doc, poses, 6, drag(2.2, 5), new Set(), 2)).toEqual([6, 5, 2, 3]);
});

test('moving and hidden parts never show, and nothing shows twice', () => {
  expect(dragSocketParts(doc, poses, 2, drag(2.2, 2, [3]), new Set([1]), 3)).toEqual([2, 4, 5, 6]);
  expect(dragSocketParts(doc, poses, 3, drag(2, null, [3]), new Set(), 1)).toEqual([2]);
});
