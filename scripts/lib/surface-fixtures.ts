import type { Vec3 } from '../../src/core/catalog-types';
import { quadPatch, splitPatch, type PatchDraft } from '../../src/core/surfaces/patches';

export const SURFACE_FIXTURES = [
  'flat',
  'crown',
  'cylinder',
  's',
  'saddle',
  'crease',
  'crease90',
] as const;
export type SurfaceFixture = (typeof SURFACE_FIXTURES)[number];
/** Small native-part experiments, not runtime presets. */
export function surfaceFixture(kind: SurfaceFixture = 'flat'): PatchDraft {
  let d = quadPatch([
    [0, 0, 0],
    [6, 0, 0],
    [6, 0, -4],
    [0, 0, -4],
  ]);
  const points = { ...d.points };
  d.grid.forEach((row, j) =>
    row.forEach((id, i) => {
      const p = points[id];
      let x = p[0];
      let y =
        kind === 'crown'
          ? i === 1 || i === 2
            ? 2 / 3
            : 0
          : kind === 's'
            ? [0, 0.6, -0.6, 0][i]
            : kind === 'saddle'
              ? (i / 3 - 0.5) * (j / 3 - 0.5)
              : 0;
      if (kind === 'cylinder') {
        const k = (4 / 3) * Math.tan(Math.PI / 12);
        x = [0, 6 * Math.cos(Math.PI / 6) * k, 6 - 6 * Math.cos(Math.PI / 6) * k, 6][i];
        y = [0, 3 * k, 3 * k, 0][i];
      }
      points[id] = [x, y, p[2]];
    }),
  );
  d = { ...d, points };
  if (kind !== 'crease' && kind !== 'crease90') return d;
  const split = splitPatch(d, 'v', 0.5);
  if (!split.ok) throw new Error(split.error);
  const a = split.draft,
    raised = { ...a.points },
    height = kind === 'crease90' ? 2 : 1;
  a.grid.forEach((row, j) =>
    row.forEach((id) => {
      const p = raised[id];
      raised[id] = [p[0], height * (j <= 3 ? j / 3 : (6 - j) / 3), p[2]];
    }),
  );
  return { ...a, points: raised, vJoins: ['crease'] };
}

export function translateFixture(d: PatchDraft, offset: Vec3): PatchDraft {
  return {
    ...d,
    points: Object.fromEntries(
      Object.entries(d.points).map(([id, p]) => [
        id,
        p.map((n, i) => n + offset[i]) as unknown as Vec3,
      ]),
    ),
  };
}
