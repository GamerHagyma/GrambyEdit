import { Matrix4 } from 'three';
import { computePoses, bodyWorld, socketMatrix, socketWorld } from '../../src/core/pose';
import type { Catalog } from '../../src/core/catalog-types';
import { docOf, part, sock, mount, pt } from '../helpers/doc';
import { realCatalog } from '../helpers/real-catalog';
let cat: Catalog;
beforeAll(async () => {
  cat = await realCatalog();
});
const close = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 8));
test.each(['Servo', 'Servo_Physics'])(
  '%s Rotation turns only output children and descendants about socket 2',
  (type) => {
    const build = (angle: number) =>
      docOf(
        part(1, type, [], { Rotation: angle }),
        part(2, 'Part', [sock('1', 1, '2')]),
        part(3, 'Part', [sock('1', 2, '6')]),
        part(4, 'Wire', [sock('1', 1, '3')]),
      );
    const base = computePoses(build(0), cat, cat.conventions),
      rot = computePoses(build(36.9), cat, cat.conventions);
    const pivot = socketWorld(base, cat, build(0), 1, '2')!;
    const delta = pivot
      .clone()
      .multiply(new Matrix4().makeRotationY((36.9 * Math.PI) / 180))
      .multiply(pivot.clone().invert());
    close(rot.world.get(1)!, base.world.get(1)!);
    close(rot.world.get(4)!, base.world.get(4)!);
    for (const id of [2, 3]) close(rot.world.get(id)!, delta.clone().multiply(base.world.get(id)!));
    close(
      socketWorld(rot, cat, build(36.9), 1, '2')!,
      pivot.clone().multiply(new Matrix4().makeRotationY((36.9 * Math.PI) / 180)),
    );
  },
);
test('nested servos compose and independently anchored wire ends stay fixed', () => {
  const build = (outer: number, inner: number) =>
    docOf(
      part(1, 'Servo', [], { Rotation: outer }),
      part(2, 'Servo_Physics', [sock('1', 1, '2')], { Rotation: inner }),
      part(3, 'Part', [sock('1', 2, '2')]),
      part(4, 'Part'),
      part(5, 'Wire', [sock('1', 2, '2'), sock('3', 4, '6')]),
    );
  const base = computePoses(build(0, 0), cat, cat.conventions),
    one = computePoses(build(30, 0), cat, cat.conventions),
    both = computePoses(build(30, -47.2), cat, cat.conventions);
  close(both.world.get(2)!, one.world.get(2)!);
  close(bodyWorld(both, 5, 1)!, bodyWorld(base, 5, 1)!);
  expect(bodyWorld(both, 5, 0)!.equals(bodyWorld(one, 5, 0)!)).toBe(false);
  const pivot = socketWorld(one, cat, build(30, 0), 2, '2')!;
  const delta = pivot
    .clone()
    .multiply(new Matrix4().makeRotationY((-47.2 * Math.PI) / 180))
    .multiply(pivot.clone().invert());
  close(both.world.get(3)!, delta.multiply(one.world.get(3)!));
});
test('points hosted by Spinner follow the output; Handle points stay fixed', () => {
  const build = (angle: number) =>
    docOf(
      part(1, 'Servo', [], { Rotation: angle }, [
        pt('{spin}', undefined, 'Spinner'),
        pt('{base}', undefined, 'Handle'),
      ]),
      part(2, 'Part', [mount('1', 1, '{spin}')]),
      part(3, 'Part', [mount('1', 1, '{base}')]),
    );
  const base = computePoses(build(0), cat, cat.conventions),
    rot = computePoses(build(90), cat, cat.conventions);
  const pivot = socketMatrix(cat, 'Servo', '2').m;
  const delta = pivot
    .clone()
    .multiply(new Matrix4().makeRotationY(Math.PI / 2))
    .multiply(pivot.clone().invert());
  close(rot.world.get(2)!, delta.multiply(base.world.get(2)!));
  close(rot.world.get(3)!, base.world.get(3)!);
});

test('prepared body preview matches full solving at fractional and multiple-turn angles', async () => {
  const { ServoPosePreview } = await import('../../src/core/servo-poses');
  const build = (angle: number) =>
    docOf(
      part(1, 'Servo', [], { Rotation: angle }),
      part(2, 'Servo_Physics', [sock('1', 1, '2')], { Rotation: 17 }),
      part(3, 'Part', [sock('1', 2, '2')]),
      part(4, 'Part'),
      part(5, 'Wire', [sock('1', 2, '2'), sock('3', 4, '6')]),
    );
  const doc = build(15),
    base = computePoses(doc, cat, cat.conventions),
    preview = new ServoPosePreview(doc, cat, base, 1);
  for (const angle of [-720, -36.9, 0, 45, 721.3]) {
    const actual = preview.at(angle),
      expected = computePoses(build(angle), cat, cat.conventions);
    for (const id of doc.order)
      for (let b = 0; b < (cat.parts[doc.parts.get(id)!.type].bodies?.length ?? 1); b++)
        close(bodyWorld(actual, id, b)!, bodyWorld(expected, id, b)!);
  }
});

test('editing a Spinner-mounted point through its unchanged world pose preserves placement', async () => {
  const { setWorldPose } = await import('../../src/core/ops/move');
  const { transact } = await import('../../src/core/ops/transact');
  const doc = docOf(
    part(1, 'Servo', [], { Rotation: 90 }, [
      pt('{u}', [0, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], 'Spinner'),
    ]),
    part(2, 'Part', [mount('1', 1, '{u}')]),
  );
  const base = computePoses(doc, cat, cat.conventions);
  const edited = transact(doc, 'identity move', (d) =>
    setWorldPose(d, cat, cat.conventions, base, 2, base.world.get(2)!),
  ).doc;
  close(computePoses(edited, cat, cat.conventions).world.get(2)!, base.world.get(2)!);
});
