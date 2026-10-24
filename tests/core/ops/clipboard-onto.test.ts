import { Matrix4 } from 'three';
import { matrix4ToCf } from '../../../src/core/cframe';
import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { buildGeneratedSubDoc, type GenRequest } from '../../../src/core/generators';
import { checkInvariants } from '../../../src/core/invariants';
import { insertSubDoc } from '../../../src/core/ops/clipboard';
import { transact } from '../../../src/core/ops/transact';
import { computePoses } from '../../../src/core/pose';
import type { Doc, PartId } from '../../../src/core/types';
import { MINI } from '../../helpers/catalog';
import { docOf, part } from '../../helpers/doc';

/** Three Parts in a row on a Connector host, as the Generators panel builds them. */
function line3(): Doc {
  const req: GenRequest = {
    shape: 'line',
    input: { params: { length: 2 }, fill: 'solid', orient: 'fixed', spacing: 1 },
    element: 'Part',
    host: 'Connector',
    color: { mode: 'single', rgb: [1, 2, 3] },
    transform: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    posDecimals: 4,
    rotDecimals: 5,
    maxElements: 100,
  };
  const r = buildGeneratedSubDoc(req, MINI, C);
  if (!r.ok) throw new Error(r.error);
  return r.sub;
}

const expectClose = (a: Matrix4, b: Matrix4) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 6));

test('a shape inserted onto an existing part hangs from new points on that part', () => {
  const sub = line3();
  const base: Doc = {
    ...docOf(part(1, 'Connector')),
    layout: new Map([[1, matrix4ToCf(new Matrix4().makeTranslation(5, 0, 0))]]),
  };
  const poses = computePoses(base, MINI, C);
  let ids = new Map<PartId, PartId>();
  const { doc } = transact(base, 'Generate', (d) => {
    ids = insertSubDoc(d, MINI, C, poses, sub, { onto: 1 });
  });

  expect(doc.order).toHaveLength(4);
  expect(ids.get(1)).toBe(1);
  const host = doc.parts.get(1)!;
  expect(host.points!.size).toBe(3);
  const subUuids = new Set(sub.parts.get(1)!.points!.keys());
  for (const uuid of host.points!.keys()) expect(subUuids.has(uuid)).toBe(false);
  for (const subId of [2, 3, 4]) {
    const target = doc.parts.get(ids.get(subId)!)!.conns[0].target;
    if (target.kind !== 'point') throw new Error('not mounted on a point');
    expect(target.part).toBe(1);
    expect(host.points!.has(target.uuid)).toBe(true);
  }
  expect(checkInvariants(doc)).toEqual([]);

  const after = computePoses(doc, MINI, C).world;
  const local = computePoses(sub, MINI, C).world;
  for (const subId of [2, 3, 4]) {
    expectClose(
      after.get(ids.get(subId)!)!,
      poses.world.get(1)!.clone().multiply(local.get(subId)!),
    );
  }
});

test('a shape cannot go onto a part of another type than its host', () => {
  const base = docOf(part(1, 'Part'));
  const poses = computePoses(base, MINI, C);
  expect(() =>
    transact(base, 'Generate', (d) => {
      insertSubDoc(d, MINI, C, poses, line3(), { onto: 1 });
    }),
  ).toThrow(/part 1 is a Part, not a Connector/);
});
