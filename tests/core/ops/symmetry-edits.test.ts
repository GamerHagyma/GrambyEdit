import { Matrix4 } from 'three';
import {
  planSymmetryEdits,
  mirrorChangedParts,
  symmetryDeleteIds,
} from '../../../src/core/ops/symmetry-edits';
import { symmetryCopies } from '../../../src/core/ops/symmetry';
import { transact, applyPatch } from '../../../src/core/ops/transact';
import { deleteParts } from '../../../src/core/ops/parts';
import { retargetPose, transformPiece } from '../../../src/core/ops/move';
import { computePoses, childSocketMatrix, socketMatrix } from '../../../src/core/pose';
import { childWorldViaSocket } from '../../../src/core/conventions';
import { matrix4ToCf } from '../../../src/core/cframe';
import { copyFrame, symmetryTransforms } from '../../../src/core/symmetry';
import { MINI } from '../../helpers/catalog';
import { docOf, part, sock } from '../../helpers/doc';
import { realCatalog } from '../../helpers/real-catalog';
import type { Doc } from '../../../src/core/types';

const C = MINI.conventions;
const same = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 7));
function scene(radial = false) {
  const transforms = symmetryTransforms(
    new Matrix4(),
    radial ? 'radial' : 'plane',
    radial ? 'y' : 'x',
    4,
  );
  const base: Doc = {
    ...docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Connector')),
    layout: new Map([
      [2, matrix4ToCf(new Matrix4().makeTranslation(2, 1, 0))],
      [3, matrix4ToCf(new Matrix4().makeTranslation(3, 0, 1))],
    ]),
  };
  let peers: number[] = [];
  const doc = transact(base, 'copies', (d) => {
    peers = symmetryCopies(d, MINI, computePoses(base, MINI, C), [2, 3], 1, transforms, true);
  }).doc;
  return { doc, transforms, peers };
}
test.each([false, true])(
  'single and grouped moves update existing counterparts (radial=%s), once per Undo',
  (radial) => {
    const { doc, transforms, peers } = scene(radial),
      before = computePoses(doc, MINI, C);
    const plan = planSymmetryEdits(doc, MINI, before, [2, 3], 1, transforms);
    expect(plan.pairs).toHaveLength(peers.length);
    const { doc: changed, patch } = transact(doc, 'move', (d) => {
      d.setLayout(2, matrix4ToCf(new Matrix4().makeRotationY(0.3).setPosition(4, 2, 1)));
      d.setLayout(3, matrix4ToCf(new Matrix4().makeTranslation(5, 1, 2)));
      mirrorChangedParts(d, MINI, plan);
    });
    expect(changed.parts.size).toBe(doc.parts.size);
    const after = computePoses(changed, MINI, C);
    for (const pair of plan.pairs)
      same(
        after.world.get(pair.target)!,
        copyFrame(pair.transform, after.world.get(pair.source)!, doc.parts.get(pair.source)!.type),
      );
    expect(applyPatch(changed, patch!, 'undo')).toEqual(doc);
  },
);
test('centered coincident parts do not acquire a false mirrored counterpart', () => {
  const doc: Doc = {
    ...docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Part')),
    layout: new Map([
      [2, matrix4ToCf(new Matrix4())],
      [3, matrix4ToCf(new Matrix4())],
    ]),
  };
  const transforms = symmetryTransforms(new Matrix4(), 'plane', 'x', 4);
  expect(
    planSymmetryEdits(doc, MINI, computePoses(doc, MINI, C), [2], 1, transforms).pairs,
  ).toHaveLength(0);
});
test('drag reattachment snaps the counterpart onto its matching real socket', () => {
  const { doc, transforms, peers } = scene(),
    poses = computePoses(doc, MINI, C);
  const plan = planSymmetryEdits(doc, MINI, poses, [2], 1, transforms);
  const moved = transact(doc, 'drop', (d) => {
    expect(retargetPose(d, MINI, C, poses, 2, { kind: 'socket', part: 1, socket: '2' }).ok).toBe(
      true,
    );
    mirrorChangedParts(d, MINI, plan, { reattach: true });
  }).doc;
  expect(moved.parts.get(peers[0])!.conns[0].target).toEqual({
    kind: 'socket',
    part: 1,
    socket: '3',
  });
});
test('moving a parent carries mirrored children once and keeps their internal sockets', () => {
  const base: Doc = {
    ...docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Connector', [sock('5', 2, '6')])),
    layout: new Map([[2, matrix4ToCf(new Matrix4().makeTranslation(2, 0, 0))]]),
  };
  const transforms = symmetryTransforms(new Matrix4(), 'plane', 'x', 4);
  let peers: number[] = [];
  const doc = transact(base, 'copy', (d) => {
    peers = symmetryCopies(d, MINI, computePoses(base, MINI, C), [2, 3], 1, transforms, true);
  }).doc;
  const poses = computePoses(doc, MINI, C),
    plan = planSymmetryEdits(doc, MINI, poses, [2], 1, transforms);
  const moved = transact(doc, 'move', (d) => {
    d.setLayout(2, matrix4ToCf(new Matrix4().makeTranslation(3, 1, 0)));
    mirrorChangedParts(d, MINI, plan);
  }).doc;
  const after = computePoses(moved, MINI, C);
  same(
    after.world.get(peers[1])!,
    new Matrix4().makeTranslation(-1, 1, 0).multiply(poses.world.get(peers[1])!),
  );
  expect(moved.parts.get(peers[1])!.conns).toEqual(doc.parts.get(peers[1])!.conns);
});
test('moving one Wire end mirrors only that end, even when the counterpart is an unmounted root', async () => {
  const cat = await realCatalog(),
    conv = cat.conventions;
  const base: Doc = {
    ...docOf(part(1, 'Part'), part(2, 'Wire')),
    layout: new Map([[2, matrix4ToCf(new Matrix4().makeTranslation(2, 0, 0))]]),
  };
  const transforms = symmetryTransforms(new Matrix4(), 'plane', 'x', 4);
  let peers: number[] = [];
  const doc = transact(base, 'copy', (d) => {
    peers = symmetryCopies(d, cat, computePoses(base, cat, conv), [2], 1, transforms, true);
  }).doc;
  const source = peers[0],
    poses = computePoses(doc, cat, conv),
    plan = planSymmetryEdits(doc, cat, poses, [source], 1, transforms);
  expect(plan.pairs[0]?.target).toBe(2);
  expect(transact(doc, 'no change', (d) => mirrorChangedParts(d, cat, plan)).patch).toBeNull();
  const changed = transact(doc, 'end move', (d) => {
    expect(
      transformPiece(d, cat, conv, poses, source, 1, new Matrix4().makeTranslation(0, 1, 0)).ok,
    ).toBe(true);
    mirrorChangedParts(d, cat, plan);
  }).doc;
  const after = computePoses(changed, cat, conv);
  same(after.bodies!.get(2)![0], poses.bodies!.get(2)![0]);
  expect(after.bodies!.get(2)![1].elements[13] - poses.bodies!.get(2)![1].elements[13]).toBeCloseTo(
    1,
  );
});
test('movements smaller than the matching tolerance still mirror exactly', () => {
  const { doc, transforms, peers } = scene(),
    poses = computePoses(doc, MINI, C),
    plan = planSymmetryEdits(doc, MINI, poses, [2], 1, transforms);
  const moved = transact(doc, 'small move', (d) => {
    d.setLayout(2, matrix4ToCf(new Matrix4().makeTranslation(2.000001, 1, 0)));
    mirrorChangedParts(d, MINI, plan);
  }).doc;
  expect(computePoses(moved, MINI, C).world.get(peers[0])!.elements[12]).toBeCloseTo(-2.000001, 9);
});
test.each([false, true])(
  'whole-part mirrored drag preserves signal connections (socket=%s)',
  (socket) => {
    const transform = symmetryTransforms(new Matrix4(), 'plane', 'x', 4)[0];
    let doc: Doc = {
      ...docOf(
        part(1, 'Part'),
        part(2, 'Splitter_2'),
        part(3, 'Splitter_2', [sock('3', 4, '1')]),
        part(4, 'Gate-AND'),
        part(5, 'Part'),
      ),
      layout: new Map([
        [4, matrix4ToCf(new Matrix4().makeTranslation(-2, 0, 0))],
        [5, matrix4ToCf(new Matrix4().makeTranslation(-4, 0, 0))],
      ]),
    };
    const first = computePoses(doc, MINI, C);
    doc = {
      ...doc,
      layout: new Map([
        ...doc.layout,
        [2, matrix4ToCf(copyFrame(transform, first.world.get(3)!, 'Splitter_2'))],
      ]),
    };
    const poses = computePoses(doc, MINI, C),
      plan = planSymmetryEdits(doc, MINI, poses, [2], 1, [transform]);
    expect(plan.pairs[0]?.target).toBe(3);
    const wanted = socket
      ? childWorldViaSocket(
          poses.world.get(5)!,
          socketMatrix(MINI, 'Part', '6').m,
          childSocketMatrix(MINI, 'Splitter_2', '5', { type: 'Part', socket: '6' }).m,
          {},
          C,
        )
      : new Matrix4().makeTranslation(-8, 3, 1);
    const changed = transact(doc, 'drop', (d) => {
      d.setLayout(2, matrix4ToCf(copyFrame(transform, wanted, 'Splitter_2')));
      mirrorChangedParts(d, MINI, plan, { reattach: true });
    }).doc;
    expect(changed.parts.get(3)!.conns).toContainEqual(sock('3', 4, '1'));
    expect(
      changed.parts
        .get(3)!
        .conns.some((c) => c.self === '5' && c.target.kind === (socket ? 'socket' : 'point')),
    ).toBe(true);
    same(computePoses(changed, MINI, C).world.get(3)!, wanted);
  },
);
test('explicit Wire-end reattachment rewires the end and mirrors the bodies it carries', async () => {
  const cat = await realCatalog(),
    conv = cat.conventions,
    transform = symmetryTransforms(new Matrix4(), 'plane', 'x', 4)[0];
  const base: Doc = {
    ...docOf(
      part(1, 'Part'),
      part(2, 'Wire', [sock('3', 4, '1')]),
      part(3, 'Part'),
      part(4, 'InputSensor'),
    ),
    layout: new Map([
      [3, matrix4ToCf(new Matrix4().makeTranslation(-4, 0, 0))],
      [4, matrix4ToCf(new Matrix4().makeTranslation(2, 0, 0))],
    ]),
  };
  let copies: number[] = [];
  const doc = transact(base, 'mirror', (d) => {
    copies = symmetryCopies(d, cat, computePoses(base, cat, conv), [2], 1, [transform], true);
  }).doc;
  const source = copies[0],
    poses = computePoses(doc, cat, conv),
    plan = planSymmetryEdits(doc, cat, poses, [source], 1, [transform]);
  const wanted = childWorldViaSocket(
    poses.world.get(3)!,
    socketMatrix(cat, 'Part', '6').m,
    childSocketMatrix(cat, 'Wire', '3', { type: 'Part', socket: '6' }).m,
    {},
    conv,
  );
  const sourceWorld = copyFrame(transform, wanted, 'Wire', undefined);
  const changed = transact(doc, 'body drop', (d) => {
    expect(
      transformPiece(
        d,
        cat,
        conv,
        poses,
        source,
        1,
        sourceWorld.clone().multiply(poses.bodies!.get(source)![1].clone().invert()),
      ).ok,
    ).toBe(true);
    mirrorChangedParts(d, cat, plan, { reattach: true, bodySources: new Set([source]) });
  }).doc;
  expect(changed.parts.get(2)!.conns).toContainEqual(sock('3', 3, '6'));
  expect(changed.parts.get(2)!.conns).not.toContainEqual(sock('3', 4, '1'));
  const after = computePoses(changed, cat, conv);
  same(after.bodies!.get(2)![0], copyFrame(transform, after.bodies!.get(source)![0], 'Wire'));
});
test('deletion includes existing reflected counterparts and preserves unrelated parts', () => {
  const { doc, transforms, peers } = scene(),
    poses = computePoses(doc, MINI, C);
  const plan = planSymmetryEdits(doc, MINI, poses, [2], 1, transforms);
  const gone = symmetryDeleteIds(plan);
  expect(new Set(gone)).toEqual(new Set([2, peers[0]]));
  const changed = transact(doc, 'delete', (d) => deleteParts(d, gone, poses)).doc;
  expect(changed.parts.has(3)).toBe(true);
  expect(changed.parts.has(peers[1])).toBe(true);
});
test('explicitly selected counterparts are not transformed twice, and an anchor move does not expand', () => {
  const { doc, transforms, peers } = scene(),
    poses = computePoses(doc, MINI, C);
  expect(planSymmetryEdits(doc, MINI, poses, [2, peers[0]], 1, transforms).pairs).toHaveLength(0);
  expect(planSymmetryEdits(doc, MINI, poses, [1, 2], 1, transforms).pairs).toHaveLength(0);
});
test('missing and ambiguous counterparts are left alone', () => {
  const { doc, transforms, peers } = scene();
  const poses = computePoses(doc, MINI, C);
  const duplicate = transact(doc, 'overlap', (d) => {
    d.add(part(doc.nextId, 'Part'));
    d.setLayout(doc.nextId, matrix4ToCf(poses.world.get(peers[0])!));
  }).doc;
  expect(
    planSymmetryEdits(duplicate, MINI, computePoses(duplicate, MINI, C), [2], 1, transforms).pairs,
  ).toHaveLength(0);
  const removed = transact(doc, 'remove', (d) => deleteParts(d, [peers[0]], poses)).doc;
  expect(
    planSymmetryEdits(removed, MINI, computePoses(removed, MINI, C), [2], 1, transforms).pairs,
  ).toHaveLength(0);
});
