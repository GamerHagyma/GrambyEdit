import { Vector3 } from 'three';
import type { Vec3 } from '../../../src/core/catalog-types';
import { quadPatch, splitPatch } from '../../../src/core/surfaces/patches';
import { evaluatePatch } from '../../../src/core/surfaces/patches';
import { tileCurved, type CurvedOptions } from '../../../src/core/surfaces/curved-tiling';
import { surfaceFixture as fixture, SURFACE_FIXTURES } from '../../../scripts/lib/surface-fixtures';

const cap = { width: 0.6446, height: 0.6446, thickness: 0.1, center: [0, 0, 0] as Vec3 };
test.each(SURFACE_FIXTURES)(
  '%s native plates cover the guide with bounded thickness error',
  async (kind) => {
    const d = fixture(kind);
    const r = await tileCurved(d, cap, { maxElements: 1000 });
    if (!r.ok) throw new Error(r.error);
    expect(r.tiles.length).toBeGreaterThan(0);
    expect(r.tiles.length).toBeLessThan(250);
    expect(r.diagnostics.maxAssignedDeviation).toBeLessThan(cap.thickness / 2);
    const inverses = r.tiles.map((t) => t.frame.clone().invert());
    // Independent solid-volume check, not just projected guide coverage.
    for (let j = 0; j <= 50; j++)
      for (let i = 0; i <= 70; i++) {
        const p = new Vector3(...evaluatePatch(d, i / 70, j / 50).position);
        expect(
          inverses.some((inv) => {
            const q = p.clone().applyMatrix4(inv);
            return (
              Math.abs(q.x) <= cap.thickness / 2 + 1e-7 &&
              Math.abs(q.y) <= cap.height / 2 + 1e-7 &&
              Math.abs(q.z) <= cap.width / 2 + 1e-7
            );
          }),
        ).toBe(true);
      }
    for (const t of r.tiles) {
      expect(t.frame.elements.every(Number.isFinite)).toBe(true);
      expect(t.frame.determinant()).toBeCloseTo(1, 9);
      expect(new Vector3().setFromMatrixColumn(t.frame, 0).length()).toBeCloseTo(1, 9);
    }
  },
);

test('smooth subdivision preserves deterministic coverage without a duplicated seam strip', async () => {
  const original = fixture('crown'),
    split = splitPatch(original, 'v', 0.2);
  if (!split.ok) throw new Error(split.error);
  const a = await tileCurved(original, cap, { maxElements: 1000 });
  const b = await tileCurved(split.draft, cap, { maxElements: 1000 });
  if (!a.ok || !b.ok) throw new Error('Expected supported guides');
  expect(b.tiles).toHaveLength(a.tiles.length);
  b.tiles.forEach((tile, i) => {
    tile.frame.elements.forEach((n, k) => expect(n).toBeCloseTo(a.tiles[i].frame.elements[k], 8));
  });
});

test('a cap budget includes every cell and rejects rather than truncating', async () => {
  const r = await tileCurved(fixture(), cap, { maxElements: 3 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe('budget');
});

test('tiny cells cannot disguise a curve too tight for a whole rigid cap', async () => {
  const d = quadPatch([
    [0, 0, 0],
    [0.1, 0, 0],
    [0.1, 0, -0.1],
    [0, 0, -0.1],
  ]);
  const points = { ...d.points };
  d.grid.forEach((row) => {
    for (const i of [1, 2]) {
      const id = row[i],
        p = points[id];
      points[id] = [p[0], 1, p[2]];
    }
  });
  const r = await tileCurved({ ...d, points }, cap, { maxElements: 1000 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe('resolution-limit');
});

test('folded, degenerate, nonfinite and malformed drafts fail visibly', async () => {
  const d = fixture(),
    points = { ...d.points };
  d.grid.forEach((row) => {
    const p = points[row[1]];
    points[row[1]] = [-8, p[1], p[2]];
  });
  for (const input of [
    { ...d, points },
    quadPatch([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]),
    { ...d, points: { ...d.points, [d.grid[0][0]]: [NaN, 0, 0] as Vec3 } },
  ]) {
    expect((await tileCurved(input, cap, { maxElements: 1000 })).ok).toBe(false);
  }
  expect((await tileCurved(d, { ...cap, width: 0 }, { maxElements: 1000 })).ok).toBe(false);
});

test('exported pose validation is used for coverage and can reject imprecise output', async () => {
  const opts: CurvedOptions = {
    maxElements: 1000,
    poseForValidation: (frame) => {
      const f = frame.clone();
      f.elements[13] += 0.2;
      return f;
    },
  };
  const r = await tileCurved(fixture(), cap, opts);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe('resolution-limit');
});

test('long geometry work yields and cancellation never returns partial success', async () => {
  let cancelled = false,
    yields = 0;
  const r = await tileCurved(fixture(), cap, {
    maxElements: 1000,
    yieldControl: async () => {
      yields++;
      cancelled = true;
    },
    cancelled: () => cancelled,
  });
  expect(yields).toBeGreaterThan(0);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe('cancelled');
});

test.each([1, 2, 3.464101615])(
  'a convex ridge of height %s aligns full-thickness outer corners without a lip',
  async (height) => {
    const d = fixture('crease90');
    const points = Object.fromEntries(
      Object.entries(d.points).map(([id, p]) => [id, [p[0], (p[1] * height) / 2, p[2]] as Vec3]),
    );
    const r = await tileCurved({ ...d, points }, cap, { maxElements: 1000 });
    if (!r.ok) throw new Error(r.error);
    const before = Math.max(...r.tiles.filter((t) => t.v < 0.5).map((t) => t.v));
    const after = Math.min(...r.tiles.filter((t) => t.v > 0.5).map((t) => t.v));
    for (const tile of r.tiles.filter((t) => t.v === before || t.v === after)) {
      const toward = tile.v < 0.5 ? -1 : 1;
      const outerEdge = new Vector3(cap.thickness / 2, (toward * cap.height) / 2, 0).applyMatrix4(
        tile.frame,
      );
      expect(outerEdge.z).toBeCloseTo(-2, 6);
      expect(outerEdge.y).toBeCloseTo(
        height + (cap.thickness / 2) * Math.sqrt(1 + (height / 2) ** 2),
        6,
      );
    }
  },
);

test('concave crease compensation does not open a gap beneath the join', async () => {
  const d = fixture('crease90');
  const points = Object.fromEntries(
    Object.entries(d.points).map(([id, p]) => [id, [p[0], -p[1], p[2]] as Vec3]),
  );
  const r = await tileCurved({ ...d, points }, cap, { maxElements: 1000 });
  if (!r.ok) throw new Error(r.error);
  const center = new Vector3(3, -2, -2);
  expect(
    r.tiles.some((t) => {
      const q = center.clone().applyMatrix4(t.frame.clone().invert());
      return (
        Math.abs(q.x) <= cap.thickness / 2 &&
        Math.abs(q.y) <= cap.height / 2 &&
        Math.abs(q.z) <= cap.width / 2
      );
    }),
  ).toBe(true);
});

test('a very sharp crease cannot hide a long native-plate spike beyond its guide', async () => {
  const d = fixture('crease90');
  const points = Object.fromEntries(
    Object.entries(d.points).map(([id, p]) => [id, [p[0], p[1] * 3.7320508, p[2]] as Vec3]),
  );
  const r = await tileCurved({ ...d, points }, cap, { maxElements: 1000 });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe('resolution-limit');
});
