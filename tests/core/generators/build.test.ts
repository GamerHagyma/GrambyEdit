import { DEFAULT_CONVENTIONS as C } from '../../../src/core/conventions';
import { buildGeneratedSubDoc, SHAPES, type GenRequest } from '../../../src/core/generators/index';
import { computePoses } from '../../../src/core/pose';
import { validate } from '../../../src/core/rules';
import { DEFAULT_LIMITS } from '../../../src/core/types';
import { MINI } from '../../helpers/catalog';

const req = (over: Partial<GenRequest> = {}): GenRequest => ({
  shape: 'line',
  input: { params: { length: 99 }, fill: 'solid', orient: 'fixed', spacing: 1 },
  element: 'Part',
  host: 'Connector',
  color: { mode: 'single', rgb: [1, 2, 3] },
  transform: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  posDecimals: 4,
  rotDecimals: 5,
  maxElements: 20_000,
  ...over,
});

test('registry has all twelve shapes', () =>
  expect(Object.keys(SHAPES).sort()).toEqual([
    'arc',
    'box',
    'cone',
    'cylinder',
    'grid',
    'helix',
    'line',
    'ring',
    'sphere',
    'stairs',
    'text',
    'torus',
  ]));

test('a 100-part line becomes one host with 100 points and 100 mounted parts', () => {
  const r = buildGeneratedSubDoc(req(), MINI, C);
  if (!r.ok) throw new Error(r.error);
  expect(r.elements).toBe(100);
  expect(r.sub.order).toHaveLength(101);
  expect(r.sub.parts.get(1)!.points!.size).toBe(100);
  expect(r.sub.parts.get(2)!.conns[0]).toMatchObject({
    self: '1',
    target: { kind: 'point', part: 1 },
  });
  expect(r.sub.parts.get(2)!.props).toEqual({ RGB: [1, 2, 3] });
  expect(validate(r.sub, MINI, DEFAULT_LIMITS, 0).filter((i) => i.severity === 'error')).toEqual(
    [],
  );
  const w = computePoses(r.sub, MINI, C).world;
  expect(w.get(2)!.elements[12]).toBeCloseTo(-49.5, 4);
  expect(w.get(101)!.elements[12]).toBeCloseTo(49.5, 4);
});

test('gradient endpoints and errors', () => {
  const g = buildGeneratedSubDoc(
    req({ color: { mode: 'gradient', from: [0, 0, 0], to: [255, 255, 255], axis: 'x' } }),
    MINI,
    C,
  );
  if (!g.ok) throw new Error(g.error);
  expect([g.sub.parts.get(2)!.props.RGB, g.sub.parts.get(101)!.props.RGB]).toEqual([
    [0, 0, 0],
    [255, 255, 255],
  ]);
  expect(buildGeneratedSubDoc(req({ element: 'Chassis' }), MINI, C)).toEqual({
    ok: false,
    error: '"Chassis" cannot be mounted on a point: it has no child socket.',
  });
  expect(buildGeneratedSubDoc(req({ maxElements: 50 }), MINI, C)).toEqual({
    ok: false,
    error: 'This shape would create 100 parts; the limit is 50.',
  });
});

test('random colors repeat for a seed; unpaintable elements get none', () => {
  const color = {
    mode: 'random',
    palette: [
      [9, 9, 9],
      [7, 7, 7],
    ],
    seed: 42,
  } as const;
  const a = buildGeneratedSubDoc(req({ color }), MINI, C);
  const b = buildGeneratedSubDoc(req({ color }), MINI, C);
  if (!a.ok || !b.ok) throw new Error('build failed');
  const rgbs = (r: typeof a) => r.sub.order.slice(1).map((id) => r.sub.parts.get(id)!.props.RGB);
  expect(rgbs(a)).toEqual(rgbs(b));
  expect(new Set(rgbs(a).map((c) => JSON.stringify(c))).size).toBe(2);
  const mags = buildGeneratedSubDoc(req({ element: 'Mag' }), MINI, C);
  if (!mags.ok) throw new Error(mags.error);
  expect(mags.sub.parts.get(2)!.props).toEqual({});
});
