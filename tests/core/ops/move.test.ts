import { Matrix4 } from 'three';
import { transact } from '../../../src/core/ops/transact';
import {
  makeFreeMovable,
  retargetPose,
  nativeRotate,
  setWorldPose,
  topmost,
} from '../../../src/core/ops/move';
import { computePoses } from '../../../src/core/pose';
import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { isSocketUsed, validate } from '../../../src/core/rules';
import { DEFAULT_LIMITS } from '../../../src/core/types';
import { docOf, part, sock, mount, pt } from '../../helpers/doc';
import { MINI } from '../../helpers/catalog';
import { importCode } from '../../helpers/import';
import { realCatalog } from '../../helpers/real-catalog';
import { corpusCodes } from '../../fixtures/corpus';

const same = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 9));

test('a structural socket joint becomes a point on the same parent without moving', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  const poses = computePoses(d0, MINI, C);
  const { doc } = transact(d0, 'free', (d) =>
    expect(makeFreeMovable(d, MINI, C, poses, 2)).toEqual({ ok: true, via: 'point' }),
  );
  expect(doc.parts.get(2)!.conns[0].target.kind).toBe('point');
  expect(isSocketUsed(doc, 1, '6')).toBe(false);
  same(computePoses(doc, MINI, C).world.get(2)!, poses.world.get(2)!);
});
test('moving a signal-joined Splitter keeps its signal joint', () => {
  const d0 = docOf(part(1, 'Gate-AND'), part(2, 'Splitter_2', [sock('3', 1, '1')]));
  const { doc } = transact(d0, 'free', (d) =>
    makeFreeMovable(d, MINI, C, computePoses(d0, MINI, C), 2),
  );
  const conns = doc.parts.get(2)!.conns;
  expect(conns[0]).toMatchObject({ self: '5', target: { kind: 'point', part: 1 } });
  expect(conns[1]).toEqual(sock('3', 1, '1'));
  expect(validate(doc, MINI, DEFAULT_LIMITS, 0).filter((i) => i.code === 'E-TEAR')).toEqual([]);
});
test('a Light on a gate output cannot be freed and says why', () => {
  const d0 = docOf(part(1, 'Gate-AND'), part(2, 'Light', [sock('1', 1, '1')]));
  transact(d0, 'free', (d) =>
    expect(makeFreeMovable(d, MINI, C, computePoses(d0, MINI, C), 2)).toEqual({
      ok: false,
      reason:
        'Light #2 has no free connection point to mount on without breaking its joint to Gate-AND #1. Detach it first to move it freely.',
    }),
  );
});
test("retargetPose refuses the part's own children", () => {
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  transact(d0, 'x', (d) =>
    expect(
      retargetPose(d, MINI, C, computePoses(d0, MINI, C), 2, {
        kind: 'socket',
        part: 3,
        socket: '2',
      }),
    ).toMatchObject({ ok: false, code: 'pose-cycle' }),
  );
});
test('native rotate writes OrientationY on socket joints', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]));
  expect(
    transact(d0, 'r', (d) =>
      nativeRotate(d, MINI, C, computePoses(d0, MINI, C), 2, 'Y', 90),
    ).doc.parts.get(2)!.props.OrientationY,
  ).toBe(90);
});
test('freeing any corpus relay never creates E-TEAR or E-MATE', async () => {
  const cat = await realCatalog();
  for (const code of corpusCodes().slice(0, 60)) {
    const d0 = importCode(code);
    const poses = computePoses(d0, cat, cat.conventions);
    const relays = [...d0.parts.values()]
      .filter((p) => /^(Wire|Splitter_\d)$/.test(p.type))
      .slice(0, 50);
    for (const p of relays) {
      const { doc } = transact(d0, 'free', (d) =>
        makeFreeMovable(d, cat, cat.conventions, poses, p.id),
      );
      const before = validate(d0, cat, DEFAULT_LIMITS, 0).filter(
        (i) => i.code === 'E-TEAR' || i.code === 'E-MATE',
      ).length;
      const after = validate(doc, cat, DEFAULT_LIMITS, 0).filter(
        (i) => i.code === 'E-TEAR' || i.code === 'E-MATE',
      ).length;
      expect(after).toBe(before);
    }
  }
}, 120_000);
test('a freed part moves through its point; a root through its layout', () => {
  const d0 = docOf(
    part(1, 'Base', [], {}, [pt('{a}', undefined, 'Base')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part'),
  );
  const poses = computePoses(d0, MINI, C);
  const to = new Matrix4().makeTranslation(3, 2, 1);
  const { doc } = transact(d0, 'move', (d) => {
    setWorldPose(d, MINI, C, poses, 2, to);
    setWorldPose(d, MINI, C, poses, 3, to);
  });
  const after = computePoses(doc, MINI, C);
  same(after.world.get(2)!, to);
  same(after.world.get(3)!, to);
});
test('retarget onto a surface makes a new point; a structural old joint is dropped', () => {
  const d0 = docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part'));
  const poses = computePoses(d0, MINI, C);
  const at = new Matrix4().makeTranslation(3, 0.5, 0);
  const { doc } = transact(d0, 'drop', (d) =>
    expect(
      retargetPose(d, MINI, C, poses, 2, { kind: 'surface', part: 3, frame: at, partName: 'Part' }),
    ).toEqual({ ok: true }),
  );
  expect(doc.parts.get(2)!.conns).toHaveLength(1);
  expect(doc.parts.get(2)!.conns[0].target).toMatchObject({ kind: 'point', part: 3 });
  expect(isSocketUsed(doc, 1, '6')).toBe(false);
  expect(doc.parts.get(3)!.points!.size).toBe(1);
});
test('topmost keeps only selected parts with no selected pose ancestor', () => {
  const d0 = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('1', 1, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
    part(4, 'Part'),
  );
  expect(topmost(d0, [3, 2, 4])).toEqual([2, 4]);
});
