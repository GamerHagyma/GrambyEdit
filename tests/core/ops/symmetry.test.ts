import { Matrix4, Vector3 } from 'three';
import { symmetryCopies } from '../../../src/core/ops/symmetry';
import { symmetryTransforms } from '../../../src/core/symmetry';
import { transact } from '../../../src/core/ops/transact';
import { computePoses } from '../../../src/core/pose';
import { toEntries, fromEntries } from '../../../src/core/doc';
import { checkInvariants } from '../../../src/core/invariants';
import { MINI } from '../../helpers/catalog';
import { docOf, part, mount, pt, sock } from '../../helpers/doc';
import type { CFrame12 } from '../../../src/core/types';
import { realCatalog } from '../../helpers/real-catalog';
import { copyFrame } from '../../../src/core/symmetry';
import { validate } from '../../../src/core/rules';
import { DEFAULT_LIMITS } from '../../../src/core/types';
const C = MINI.conventions;
const scene = () =>
  docOf(
    part(1, 'Part', [], {}, [pt('{at}', [2, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])]),
    part(2, 'Part', [mount('1', 1, '{at}')], { RGB: [1, 2, 3] }),
  );
const copies = (base = scene(), mode: 'plane' | 'radial' = 'plane', ids = [2]) => {
  const poses = computePoses(base, MINI, C);
  let made: number[] = [];
  const result = transact(base, 'Mirror', (d) => {
    made = symmetryCopies(
      d,
      MINI,
      poses,
      ids,
      1,
      symmetryTransforms(poses.world.get(1)!, mode, mode === 'plane' ? 'x' : 'y', 4),
      true,
    );
  });
  return { ...result, made, poses };
};
test('mirrored copies have fresh IDs and point mounts, one patch, and exportable placement', () => {
  const { doc, made, patch, poses } = copies();
  expect(made).toHaveLength(1);
  const world = computePoses(doc, MINI, C).world.get(made[0])!;
  expect(world.elements[12]).toBeCloseTo(-poses.world.get(2)!.elements[12]);
  expect(doc.parts.get(made[0])!.props.RGB).toEqual([1, 2, 3]);
  expect(doc.parts.get(made[0])!.conns[0].target).toMatchObject({ kind: 'point', part: 1 });
  expect(patch).not.toBeNull();
  expect(checkInvariants(doc)).toEqual([]);
  const roundtrip = fromEntries(toEntries(doc));
  expect(roundtrip.ok).toBe(true);
  if (roundtrip.ok) {
    const landed = computePoses(roundtrip.doc, MINI, C).world.get(made[0])!;
    landed.elements.forEach((v, i) => expect(v).toBeCloseTo(world.elements[i], 7));
  }
});
test('radial copies preserve child hierarchy and internal socket joints', () => {
  const base = scene();
  const withChild = {
    ...base,
    parts: new Map([...base.parts, [3, part(3, 'Part', [sock('1', 2, '6')])]]),
    order: [1, 2, 3],
    nextId: 4,
  };
  const { doc, made } = copies(withChild, 'radial', [2, 3]);
  expect(made).toHaveLength(6);
  expect(doc.parts.get(made[1])!.conns[0].target).toEqual({
    kind: 'socket',
    part: made[0],
    socket: '6',
  });
  expect(checkInvariants(doc)).toEqual([]);
  const worlds = computePoses(doc, MINI, C).world;
  expect(new Vector3().setFromMatrixPosition(worlds.get(made[0])!).length()).toBeCloseTo(
    new Vector3().setFromMatrixPosition(worlds.get(2)!).length(),
  );
});
test('centered copies are skipped and a bad mount rolls the whole operation back', () => {
  const centered = docOf(part(1, 'Part'), part(2, 'Part'));
  const fixed = {
    ...centered,
    layout: new Map<number, CFrame12>([
      [1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [2, [0, 2, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
    ]),
  };
  expect(copies(fixed).made).toEqual([]);
  const unmountable = {
    ...scene(),
    parts: new Map([
      [1, part(1, 'Part')],
      [2, part(2, 'Chassis')],
    ]),
  };
  expect(() => copies(unmountable)).toThrow(/mount/i);
  expect(unmountable.parts.size).toBe(2);
});

test('real native wire ends mirror and rotate independently, including after share-code roundtrip', async () => {
  const cat = await realCatalog();
  const base = docOf(
    part(1, 'Part', [], {}, [
      pt('{a}', [2, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      pt('{b}', [4, 3, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    ]),
    part(2, 'Wire', [mount('1', 1, '{a}'), mount('3', 1, '{b}')], { RGB: [12, 34, 56] }),
  );
  const poses = computePoses(base, cat, cat.conventions);
  for (const mode of ['plane', 'radial'] as const) {
    const transforms = symmetryTransforms(new Matrix4(), mode, 'x', 3);
    let ids: number[] = [];
    const result = transact(base, 'symmetry', (d) => {
      ids = symmetryCopies(d, cat, poses, [2], 1, transforms, false);
    }).doc;
    const worlds = computePoses(result, cat, cat.conventions);
    for (let i = 0; i < ids.length; i++)
      for (let b = 0; b < 2; b++) {
        const expected = copyFrame(
          transforms[i],
          poses.bodies!.get(2)![b],
          'Wire',
          new Vector3(...cat.parts.Wire.bodies![b].pivot),
        );
        worlds
          .bodies!.get(ids[i])!
          [b].elements.forEach((v, j) => expect(v).toBeCloseTo(expected.elements[j], 6));
      }
    expect(checkInvariants(result)).toEqual([]);
    const loaded = fromEntries(toEntries(result));
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      const roundtrip = computePoses(loaded.doc, cat, cat.conventions);
      for (const id of ids)
        roundtrip
          .bodies!.get(id)!
          .forEach((m, b) =>
            m.elements.forEach((v, i) =>
              expect(v).toBeCloseTo(worlds.bodies!.get(id)![b].elements[i], 6),
            ),
          );
    }
  }
});
test('nested point children get new UUIDs, no point is shared, originals stay untouched and repeated Apply is a no-op', () => {
  const base = scene();
  const p2 = {
    ...base.parts.get(2)!,
    points: new Map([['{child}', pt('{child}', [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])]]),
  };
  const source = {
    ...base,
    parts: new Map([...base.parts, [2, p2], [3, part(3, 'Part', [mount('1', 2, '{child}')])]]),
    order: [1, 2, 3],
    nextId: 4,
  };
  const { doc, made } = copies(source, 'plane', [2, 3]);
  expect(made).toHaveLength(2);
  expect(doc.parts.get(2)).toBe(source.parts.get(2));
  expect([...doc.parts.get(made[0])!.points!.keys()]).not.toContain('{child}');
  expect(checkInvariants(doc)).toEqual([]);
  expect(copies(doc, 'plane', [2, 3]).made).toEqual([]);
});

test('native servo output children and paired doors keep exportable reflected placement', async () => {
  const cat = await realCatalog();
  const base = docOf(
    part(1, 'Part', [], {}, [
      pt('{servo}', [3, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      pt('{door}', [4, 0, 2, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    ]),
    part(2, 'Servo', [mount('1', 1, '{servo}')], { Rotation: 32, Speed: 45 }),
    part(3, 'Part', [sock('1', 2, '2')]),
    part(4, 'DoorA', [mount('1', 1, '{door}')]),
  );
  const poses = computePoses(base, cat, cat.conventions),
    [transform] = symmetryTransforms(new Matrix4(), 'plane', 'x', 4);
  let made: number[] = [];
  const { doc } = transact(base, 'mirror', (d) => {
    made = symmetryCopies(d, cat, poses, [2, 3, 4], 1, [transform], false);
  });
  expect(doc.parts.get(made[0])!.props.Rotation).toBe(-32);
  expect(doc.parts.get(made[2])!.type).toBe('DoorB');
  expect(checkInvariants(doc)).toEqual([]);
  const final = computePoses(doc, cat, cat.conventions);
  for (const [i, id] of [2, 3, 4].entries())
    copyFrame(transform, poses.world.get(id)!, base.parts.get(id)!.type).elements.forEach((v, j) =>
      expect(final.world.get(made[i])!.elements[j]).toBeCloseTo(v, 6),
    );
});

test('cyclic selections and excessive copy counts reject atomically', () => {
  const loop = docOf(
    part(1, 'Part'),
    part(2, 'Part', [sock('1', 3, '6')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  expect(() => copies(loop, 'plane', [2, 3])).toThrow(/cycles/);
  const large = docOf(
      part(1, 'Part'),
      ...Array.from({ length: 801 }, (_, i) => part(i + 2, 'Part')),
    ),
    poses = computePoses(large, MINI, C);
  expect(() =>
    transact(large, 'Too large', (d) =>
      symmetryCopies(
        d,
        MINI,
        poses,
        large.order.slice(1),
        1,
        symmetryTransforms(new Matrix4(), 'radial', 'y', 16),
        false,
      ),
    ),
  ).toThrow(/too large/);
  expect(large.parts.size).toBe(802);
});

test('a reused matching parent never gets a second child on an occupied socket', () => {
  const base = {
    ...docOf(
      part(1, 'Part'),
      part(2, 'Part'),
      part(3, 'Part', [sock('1', 2, '6')], { RGB: [255, 0, 0] }),
      part(4, 'Part'),
      part(5, 'Part', [sock('1', 4, '6')], { RGB: [0, 0, 255] }),
    ),
    layout: new Map<number, CFrame12>([
      [1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [2, [3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [4, [-3, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]],
    ]),
  };
  const poses = computePoses(base, MINI, C);
  const { doc } = transact(base, 'radial', (d) =>
    symmetryCopies(
      d,
      MINI,
      poses,
      [2, 3],
      1,
      symmetryTransforms(new Matrix4(), 'radial', 'y', 2),
      false,
    ),
  );
  expect(validate(doc, MINI, DEFAULT_LIMITS, 0).filter((i) => i.severity === 'error')).toEqual([]);
});
test('deduplication also reuses parts created by earlier radial sectors', () => {
  const base = {
    ...docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Part')),
    layout: new Map<number, CFrame12>([
      [1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [2, [3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [3, [-3, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]],
    ]),
  };
  expect(copies(base, 'radial', [2, 3]).made).toHaveLength(2);
});
test('an occupied reused signal target refuses the entire operation instead of adding a second wire', () => {
  const base = {
    ...docOf(
      part(1, 'Part'),
      part(2, 'Gate-AND'),
      part(3, 'Switch', [sock('1', 2, '2')], { RGB: [255, 0, 0] }),
      part(4, 'Gate-AND'),
      part(5, 'Switch', [sock('1', 4, '2')], { RGB: [0, 0, 255] }),
    ),
    layout: new Map<number, CFrame12>([
      [1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [2, [3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [4, [-3, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]],
    ]),
  };
  const poses = computePoses(base, MINI, C);
  expect(() =>
    transact(base, 'radial', (d) =>
      symmetryCopies(
        d,
        MINI,
        poses,
        [2, 3],
        1,
        symmetryTransforms(new Matrix4(), 'radial', 'y', 2),
        false,
      ),
    ),
  ).toThrow(/signal socket.*occupied/);
  expect(base.parts.size).toBe(5);
});
test('secondary signal joints on reused occupied targets are also rejected atomically', () => {
  const base = {
    ...docOf(
      part(1, 'Part', [], {}, [pt('{a}'), pt('{b}')]),
      part(2, 'Gate-AND'),
      part(3, 'Switch', [mount('3', 1, '{a}'), sock('1', 2, '2')], { RGB: [255, 0, 0] }),
      part(4, 'Gate-AND'),
      part(5, 'Switch', [mount('3', 1, '{b}'), sock('1', 4, '2')], { RGB: [0, 0, 255] }),
    ),
    layout: new Map<number, CFrame12>([
      [1, [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [2, [3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]],
      [4, [-3, 0, 0, -1, 0, 0, 0, 1, 0, 0, 0, -1]],
    ]),
  };
  const poses = computePoses(base, MINI, C);
  expect(() =>
    transact(base, 'radial', (d) =>
      symmetryCopies(
        d,
        MINI,
        poses,
        [2, 3],
        1,
        symmetryTransforms(new Matrix4(), 'radial', 'y', 2),
        false,
      ),
    ),
  ).toThrow(/Cannot preserve mirrored connections/);
  expect(base.parts.size).toBe(5);
});
