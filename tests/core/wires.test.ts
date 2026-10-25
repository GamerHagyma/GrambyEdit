import { Matrix4 } from 'three';
import { computePoses, type Poses } from '../../src/core/pose';
import { wireSegments, wireStretchIssues } from '../../src/core/wires';
import { validate } from '../../src/core/rules';
import { DEFAULT_LIMITS } from '../../src/core/types';
import { toShareCode } from '../../src/core/share';
import { realCatalog } from '../helpers/real-catalog';
import { docOf, mount, part, pt } from '../helpers/doc';

test.each([
  ['Wire', 1],
  ['Switch', 1],
  ['Button', 1],
  ['RemoteButton', 1],
  ['PressurePlate', 1],
  ['TripWire', 1],
  ['Splitter', 4],
  ['Splitter_1', 1],
  ['Splitter_2', 2],
  ['Splitter_3', 3],
  ['Splitter_4', 4],
  ['Rope', 0],
  ['RubberBand', 0],
  ['Part', 0],
] as const)('%s has %i internal wires', async (type, count) => {
  const cat = await realCatalog(),
    doc = docOf(part(1, type));
  const segments = wireSegments(doc, cat, computePoses(doc, cat, cat.conventions));
  expect(segments).toHaveLength(count);
  expect(segments.every((segment) => segment.fromBody === 0)).toBe(true);
  expect(segments.map((segment) => segment.toBody)).toEqual(
    Array.from({ length: count }, (_, i) => i + 1),
  );
});

export const wirePoses = (distance: number): Poses => ({
  world: new Map([[1, new Matrix4().makeTranslation(2, 0, 0)]]),
  bodies: new Map([
    [
      1,
      [new Matrix4().makeTranslation(2, 0, 0), new Matrix4().makeTranslation(2 + distance, 0, -1)],
    ],
  ]),
  flags: new Map(),
  approxCount: 0,
});

test.each([
  [0, false],
  [10, false],
  [10.001, true],
  [12, true],
] as const)(
  'the 10-stud threshold is strictly exceeded at length %s: %s',
  async (distance, stretched) => {
    const cat = await realCatalog(),
      doc = docOf(part(1, 'Wire'));
    const [segment] = wireSegments(doc, cat, wirePoses(distance));
    expect(segment.from.toArray()).toEqual([2, 0, 0]);
    expect(segment.to.toArray()).toEqual([2 + distance, 0, 0]);
    expect(segment.length).toBeCloseTo(distance, 9);
    expect(segment.stretched).toBe(stretched);
    expect(wireStretchIssues(doc, cat, wirePoses(distance))).toHaveLength(stretched ? 1 : 0);
  },
);

test('validation reports one warning per stretched part without modifying its export', async () => {
  const cat = await realCatalog();
  const up = (x: number) => [x, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  const doc = docOf(
    part(1, 'Part', [], {}, [pt('{a}', up(0)), pt('{b}', up(12))]),
    part(2, 'Wire', [mount('1', 1, '{a}'), mount('3', 1, '{b}')]),
  );
  const code = toShareCode(doc);
  const issues = validate(doc, cat, DEFAULT_LIMITS, code.length).filter(
    (issue) => issue.code === 'W-WIRE-STRETCHED',
  );
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({ severity: 'warning', parts: [2] });
  expect(issues[0].message).toContain('10');
  expect(issues[0].message).toContain('Wire');
  expect(toShareCode(doc)).toBe(code);
});

test('PressurePlate wire joins its captured base and separately placed output', async () => {
  const cat = await realCatalog(),
    doc = docOf(part(1, 'PressurePlate'));
  const [segment] = wireSegments(doc, cat, computePoses(doc, cat, cat.conventions));
  expect(segment.from.toArray()).toEqual([0, 0, 0]);
  expect(segment.to.toArray()).toEqual([-2, 0, 0]);
});
