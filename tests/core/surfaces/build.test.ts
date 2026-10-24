import { Matrix4, Vector3 } from 'three';
import type { Catalog } from '../../../src/core/catalog-types';
import { DEFAULT_CONVENTIONS } from '../../../src/core/conventions';
import { computePoses } from '../../../src/core/pose';
import {
  buildSurfaceSubDoc,
  capSize,
  defaultCorners,
  STAGGER,
  type SurfaceColor,
} from '../../../src/core/surfaces/build';
import { tileQuad, type Corners } from '../../../src/core/surfaces/tiling';
import { MINI } from '../../helpers/catalog';
import { realCatalog } from '../../helpers/real-catalog';

const OPTS = { posDecimals: 6, rotDecimals: 8, maxElements: 1000 };
const position = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);

function build(cat: Catalog, corners: Corners, color: SurfaceColor) {
  const r = buildSurfaceSubDoc({ hostType: 'Part', corners, color }, cat, cat.conventions, OPTS);
  if (!r.ok) throw new Error(r.error);
  return r;
}

test('a two-cap square on a face becomes four GasCaps exactly on their tiles', async () => {
  const cat = await realCatalog();
  const cap = capSize(cat)!;
  expect([cap.width, cap.height, cap.thickness]).toEqual([
    expect.closeTo(0.6446, 4),
    expect.closeTo(0.6446, 4),
    expect.closeTo(0.1, 6),
  ]);
  // A point on a Part's top face: +Y out of it.
  const corners = defaultCorners(new Matrix4().makeTranslation(0, 0.5, 0), cap);
  for (const c of corners) {
    expect(c[1]).toBeCloseTo(0.5 + cap.thickness / 2, 9);
    expect(Math.abs(c[0])).toBeCloseTo(cap.width, 9);
    expect(Math.abs(c[2])).toBeCloseTo(cap.width, 9);
  }
  const [p0, p1, , p3] = corners.map((c) => new Vector3(...c));
  expect(p1.clone().sub(p0).cross(p3.clone().sub(p0)).y).toBeGreaterThan(0);

  const r = build(cat, corners, { mode: 'single', rgb: [10, 20, 30] });
  expect([r.count, r.rows]).toEqual([4, 2]);
  expect(r.sub.order).toHaveLength(5);
  const tiling = tileQuad(corners, cap, 100);
  if (!tiling.ok) throw new Error(tiling.error);
  const world = computePoses(r.sub, cat, cat.conventions).world;
  tiling.tiles.forEach((t, i) => {
    const part = r.sub.parts.get(i + 2)!;
    expect(part.type).toBe('GasCap');
    expect(part.props).toEqual({ RGB: [10, 20, 30] });
    world.get(i + 2)!.elements.forEach((v, k) => expect(v).toBeCloseTo(t.frame.elements[k], 5));
  });
});

test('caps in several colours are lifted apart; a gradient runs from corner 1 to corner 2', async () => {
  const cat = await realCatalog();
  const w = capSize(cat)!.width;
  const corners: Corners = [
    [0, 0, 0],
    [3 * w, 0, 0],
    [3 * w, 0, -2 * w],
    [0, 0, -2 * w],
  ];
  const tiling = tileQuad(corners, capSize(cat)!, 100);
  if (!tiling.ok) throw new Error(tiling.error);
  const random = build(cat, corners, { mode: 'random', palette: [[1, 1, 1]], seed: 3 });
  const world = computePoses(random.sub, cat, cat.conventions).world;
  tiling.tiles.forEach((t, i) => {
    const lift = position(world.get(i + 2)!).sub(position(t.frame)).y;
    expect(lift).toBeCloseTo(STAGGER * ((t.col % 2) + 2 * (t.row % 2)), 5);
  });

  const gradient = build(cat, corners, {
    mode: 'gradient',
    from: [0, 0, 0],
    to: [255, 255, 255],
    axis: 'u',
  });
  const rgb = (i: number) => gradient.sub.parts.get(i + 2)!.props.RGB;
  const last = Math.max(...tiling.tiles.map((t) => t.col));
  tiling.tiles.forEach((t, i) => {
    if (t.col === 0) expect(rgb(i)).toEqual([0, 0, 0]);
    if (t.col === last) expect(rgb(i)).toEqual([255, 255, 255]);
  });
});

test('a library without GasCaps cannot build surfaces', () => {
  const corners: Corners = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 0, -1],
    [0, 0, -1],
  ];
  expect(
    buildSurfaceSubDoc(
      { hostType: 'Part', corners, color: { mode: 'single', rgb: [1, 1, 1] } },
      MINI,
      DEFAULT_CONVENTIONS,
      OPTS,
    ),
  ).toEqual({ ok: false, error: 'This part library has no GasCap.' });
});

test('flat surfaces export the game-calibrated point offset while keeping the plate centred', async () => {
  const cat = await realCatalog();
  const cap = capSize(cat)!;
  const corners = defaultCorners(new Matrix4().makeTranslation(0, 0.5, 0), cap);
  const r = build(cat, corners, { mode: 'single', rgb: [10, 20, 30] });
  const points = [...r.sub.parts.get(1)!.points!.values()]
    .map((point) => point.cframe.slice(0, 3))
    .sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  // Centre +/-0.3223, plus 0.322 along the point-plane's +X (world +Z in this flat case).
  // The 0.322 is the captured native hinge distance, confirmed by all three green game probes.
  expect(points).toEqual([
    [-0.3223, 0.55, -0.0003],
    [-0.3223, 0.55, 0.6443],
    [0.3223, 0.55, -0.0003],
    [0.3223, 0.55, 0.6443],
  ]);
});
