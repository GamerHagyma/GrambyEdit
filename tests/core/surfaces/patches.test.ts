import type { Vec3 } from '../../../src/core/catalog-types';
import {
  coonsPatch,
  editPatch,
  evaluatePatch,
  evaluatePatchSpan,
  quadPatch,
  splitPatch,
  validatePatch,
  type PatchDraft,
  type DraftResult,
} from '../../../src/core/surfaces/patches';
import { bilinear, type Corners } from '../../../src/core/surfaces/tiling';

const corners: Corners = [
  [0, 0, 0],
  [4, 0, 0],
  [5, 1, -6],
  [0, 0, -6],
];
const unwrap = (r: DraftResult): PatchDraft => {
  if (!r.ok) throw new Error(r.error);
  return r.draft;
};
function close(a: Vec3, b: Vec3, digits = 9) {
  a.forEach((n, i) => expect(n).toBeCloseTo(b[i], digits));
}
function compare(a: PatchDraft, b: PatchDraft) {
  for (let i = 0; i <= 20; i++)
    for (let j = 0; j <= 20; j++) {
      const s = evaluatePatch(a, i / 20, j / 20);
      const t = evaluatePatch(b, i / 20, j / 20);
      close(s.position, t.position);
      close(s.du, t.du);
      close(s.dv, t.dv);
    }
}
function smooth(d: PatchDraft) {
  for (let u = 0; u < d.uBreaks.length - 1; u++) {
    for (let v = 0; v < d.vBreaks.length - 2; v++) {
      if (d.vJoins[v] !== 'smooth') continue;
      for (const t of [0, 0.2, 0.5, 1]) {
        const a = evaluatePatchSpan(d, u, v, t, 1);
        const b = evaluatePatchSpan(d, u, v + 1, t, 0);
        close(a.position, b.position);
        close(a.du, b.du);
        close(a.dv, b.dv);
      }
    }
  }
  for (let u = 0; u < d.uBreaks.length - 2; u++) {
    if (d.uJoins[u] !== 'smooth') continue;
    for (let v = 0; v < d.vBreaks.length - 1; v++)
      for (const t of [0, 0.2, 0.5, 1]) {
        const a = evaluatePatchSpan(d, u, v, 1, t);
        const b = evaluatePatchSpan(d, u + 1, v, 0, t);
        close(a.position, b.position);
        close(a.du, b.du);
        close(a.dv, b.dv);
      }
  }
}

test('a straight patch is exactly the existing bilinear guide', () => {
  const d = quadPatch(corners);
  expect(validatePatch(d)).toBeNull();
  for (const u of [0, 0.17, 0.5, 1])
    for (const v of [0, 0.37, 1])
      close(evaluatePatch(d, u, v).position, bilinear(corners, u, v).toArray());
});

test('Coons interpolates four consistently directed cubic boundaries', () => {
  const d = quadPatch(corners);
  const edge = (ids: readonly string[]) =>
    ids.map((id) => d.points[id]) as unknown as readonly [Vec3, Vec3, Vec3, Vec3];
  const b = edge(d.grid[0]);
  const top = edge(d.grid[3]);
  const left = edge(d.grid.map((r) => r[0]));
  const right = edge(d.grid.map((r) => r[3]));
  const bent = [b[0], [1, 2, 0] as Vec3, [3, 2, 0] as Vec3, b[3]] as const;
  const c = unwrap(coonsPatch([bent, top, left, right]));
  close(evaluatePatch(c, 0.5, 0).position, [2, 1.5, 0]);
  for (const v of [0, 0.3, 1])
    close(evaluatePatch(c, 0, v).position, evaluatePatch(d, 0, v).position);
  expect(coonsPatch([bent, top, right, left]).ok).toBe(false);
});

test('analytic derivatives agree with centered finite differences', () => {
  const d = quadPatch(corners),
    h = 1e-5;
  const s = evaluatePatch(d, 0.37, 0.61);
  const derivative = (u0: number, v0: number, u1: number, v1: number): Vec3 =>
    evaluatePatch(d, u1, v1).position.map(
      (n, i) => (n - evaluatePatch(d, u0, v0).position[i]) / (2 * h),
    ) as unknown as Vec3;
  close(s.du, derivative(0.37 - h, 0.61, 0.37 + h, 0.61), 7);
  close(s.dv, derivative(0.37, 0.61 - h, 0.37, 0.61 + h), 7);
});

test('nonuniform exact splits preserve the full guide and derivatives without mutation', () => {
  const d = quadPatch(corners),
    saved = JSON.stringify(d);
  const a = unwrap(splitPatch(d, 'v', 0.2));
  const b = unwrap(splitPatch(a, 'u', 0.73));
  const c = unwrap(splitPatch(b, 'v', 0.73));
  compare(d, c);
  smooth(c);
  expect(JSON.stringify(d)).toBe(saved);
  expect(c.grid[0][0]).toBe(d.grid[0][0]);
  expect(c.grid.at(-1)!.at(-1)).toBe(d.grid[3][3]);
  for (const t of [0, 0.2, 1, NaN]) expect(splitPatch(c, 'v', t).ok).toBe(false);
});

test('anchor and tangent edits preserve full weighted C1 across intersecting joins', () => {
  let d = unwrap(splitPatch(unwrap(splitPatch(quadPatch(corners), 'v', 0.2)), 'u', 0.73));
  d = unwrap(editPatch(d, { kind: 'move', positions: { [d.grid[3][3]]: [3, 2, -1] } }));
  smooth(d);
  const id = d.grid[2][2],
    p = d.points[id];
  d = unwrap(editPatch(d, { kind: 'move', positions: { [id]: [p[0], p[1] + 0.4, p[2]] } }));
  smooth(d);
});

test('moving an entire profile carries tangent offsets and remains smooth', () => {
  const d = unwrap(splitPatch(quadPatch(corners), 'v', 0.2));
  const positions = Object.fromEntries(
    d.grid[3].map((id) => {
      const p = d.points[id];
      return [id, [p[0], p[1] + 2, p[2]] as Vec3];
    }),
  );
  const next = unwrap(editPatch(d, { kind: 'move', positions: positions as Record<string, Vec3> }));
  smooth(next);
  d.grid[3].forEach((id) => expect(next.points[id][1]).toBeCloseTo(d.points[id][1] + 2));
});

test('crease has shared positions and independent one-sided derivatives', () => {
  let d = unwrap(splitPatch(quadPatch(corners), 'v', 0.2));
  d = unwrap(editPatch(d, { kind: 'join', axis: 'v', index: 0, mode: 'crease' }));
  const p = d.points[d.grid[4][1]];
  d = unwrap(editPatch(d, { kind: 'move', positions: { [d.grid[4][1]]: [p[0], p[1] + 1, p[2]] } }));
  const a = evaluatePatchSpan(d, 0, 0, 0.5, 1),
    b = evaluatePatchSpan(d, 0, 1, 0.5, 0);
  close(a.position, b.position);
  expect(a.dv).not.toEqual(b.dv);
  close(evaluatePatch(d, 0.5, 0.2).dv, b.dv);
  d = unwrap(editPatch(d, { kind: 'join', axis: 'v', index: 0, mode: 'smooth' }));
  smooth(d);
});

test('incompatible explicit tangent edits are rejected atomically', () => {
  const d = unwrap(splitPatch(quadPatch(corners), 'v', 0.2)),
    saved = JSON.stringify(d);
  const a = d.grid[2][0],
    b = d.grid[4][0];
  const r = editPatch(d, { kind: 'move', positions: { [a]: [0, 3, -1], [b]: [0, 3, -2] } });
  expect(r.ok).toBe(false);
  expect(JSON.stringify(d)).toBe(saved);
});

test('removal keeps endpoints and refuses removing the minimum section count', () => {
  const d = quadPatch(corners);
  expect(editPatch(d, { kind: 'remove', axis: 'v', index: 0 }).ok).toBe(false);
  const a = unwrap(splitPatch(d, 'v', 0.2));
  const b = unwrap(editPatch(a, { kind: 'remove', axis: 'v', index: 1 }));
  expect(b.grid).toHaveLength(4);
  expect(validatePatch(b)).toBeNull();
  close(evaluatePatch(b, 0, 0).position, corners[0]);
  close(evaluatePatch(b, 1, 1).position, corners[2]);
});

test('structural validation rejects nonfinite, missing, duplicate and malformed controls/knots', () => {
  const d = quadPatch(corners),
    id = d.grid[0][0];
  expect(validatePatch({ ...d, points: { ...d.points, [id]: [NaN, 0, 0] } })).not.toBeNull();
  expect(validatePatch({ ...d, grid: [...d.grid.slice(1)] })).not.toBeNull();
  expect(validatePatch({ ...d, uBreaks: [0, 0.5, 0.5, 1] })).not.toBeNull();
  expect(validatePatch({ ...d, points: {} })).not.toBeNull();
  expect(validatePatch({ ...d, points: { ...d.points, unused: [0, 0, 0] } })).not.toBeNull();
  expect(validatePatch({ ...d, grid: d.grid.map((r) => r.map(() => id)) })).not.toBeNull();
  expect(editPatch(d, { kind: 'move', positions: { missing: [0, 0, 0] } }).ok).toBe(false);
});
