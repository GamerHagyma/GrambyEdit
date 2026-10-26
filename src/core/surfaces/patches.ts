// Parent-local, shared bicubic control net. Profile rows are 0, 3, 6, ...;
// every patch owns 4x4 controls and shares its boundary with its neighbour.
import type { Vec3 } from '../catalog-types';
import type { Corners } from './tiling';

export type ControlId = string;
export type JoinMode = 'smooth' | 'crease';
export type Cubic = readonly [Vec3, Vec3, Vec3, Vec3];
export interface PatchDraft {
  readonly points: Readonly<Record<ControlId, Vec3>>;
  readonly grid: readonly (readonly ControlId[])[];
  readonly uBreaks: readonly number[];
  readonly vBreaks: readonly number[];
  readonly uJoins: readonly JoinMode[];
  readonly vJoins: readonly JoinMode[];
}
export interface PatchSample {
  readonly position: Vec3;
  readonly du: Vec3;
  readonly dv: Vec3;
}
export type DraftResult = { ok: true; draft: PatchDraft } | { ok: false; error: string };
export type PatchEdit =
  | { kind: 'move'; positions: Readonly<Record<ControlId, Vec3>> }
  | { kind: 'join'; axis: 'u' | 'v'; index: number; mode: JoinMode }
  | { kind: 'remove'; axis: 'u' | 'v'; index: number };
export const MAX_CONTROLS = 10_000;
const EPS = 1e-8;
const fail = (error: string): DraftResult => ({ ok: false, error });
const finite = (p: Vec3) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
const near = (a: Vec3, b: Vec3) => a.every((n, i) => Math.abs(n - b[i]) < EPS);
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => add(scale(a, 1 - t), scale(b, t));
const transpose = <T>(g: readonly (readonly T[])[]): T[][] =>
  g[0].map((_, i) => g.map((r) => r[i]));

export function validatePatch(d: PatchDraft): string | null {
  const knots = (b: readonly number[]) =>
    b.length >= 2 &&
    b[0] === 0 &&
    b.at(-1) === 1 &&
    b.every((v, i) => Number.isFinite(v) && (i === 0 || v - b[i - 1] > 1e-8));
  if (!knots(d.uBreaks) || !knots(d.vBreaks)) return 'Surface intervals must increase from 0 to 1.';
  const rows = 3 * (d.vBreaks.length - 1) + 1,
    cols = 3 * (d.uBreaks.length - 1) + 1;
  if (rows * cols > MAX_CONTROLS) return 'This surface has too many control points.';
  if (d.grid.length !== rows || d.grid.some((r) => r.length !== cols))
    return 'Invalid surface control grid.';
  const ids = d.grid.flat();
  if (Object.keys(d.points).length !== ids.length) return 'Surface controls must match the grid.';
  if (new Set(ids).size !== ids.length) return 'Control IDs must be unique within the grid.';
  if (ids.some((id) => !Object.hasOwn(d.points, id) || !finite(d.points[id])))
    return 'Surface controls must be finite XYZ positions.';
  if (
    d.uJoins.length !== d.uBreaks.length - 2 ||
    d.vJoins.length !== d.vBreaks.length - 2 ||
    [...d.uJoins, ...d.vJoins].some((m) => m !== 'smooth' && m !== 'crease')
  )
    return 'Invalid surface join modes.';
  return null;
}

function fromGrid(positions: readonly (readonly Vec3[])[]): PatchDraft {
  const points: Record<string, Vec3> = {};
  const grid = positions.map((r, j) =>
    r.map((p, i) => {
      const id = `c${j * r.length + i}`;
      points[id] = p;
      return id;
    }),
  );
  return { points, grid, uBreaks: [0, 1], vBreaks: [0, 1], uJoins: [], vJoins: [] };
}

export function quadPatch(c: Corners): PatchDraft {
  return fromGrid(
    Array.from({ length: 4 }, (_, j) =>
      Array.from({ length: 4 }, (_, i) =>
        mix(mix(c[0], c[1], i / 3), mix(c[3], c[2], i / 3), j / 3),
      ),
    ),
  );
}

export function coonsPatch(edges: readonly [Cubic, Cubic, Cubic, Cubic]): DraftResult {
  const [b, t, l, r] = edges;
  if (edges.some((e) => e.length !== 4 || e.some((p) => !finite(p))))
    return fail('Invalid cubic boundary.');
  if (!near(b[0], l[0]) || !near(b[3], r[0]) || !near(t[0], l[3]) || !near(t[3], r[3]))
    return fail('Curve boundaries must share their endpoints and directions.');
  const q = quadPatch([b[0], b[3], t[3], t[0]]);
  const d = fromGrid(
    Array.from({ length: 4 }, (_, j) =>
      Array.from({ length: 4 }, (_, i) =>
        sub(add(mix(b[i], t[i], j / 3), mix(l[j], r[j], i / 3)), q.points[q.grid[j][i]]),
      ),
    ),
  );
  return { ok: true, draft: d };
}

function weights(t: number): number[] {
  const a = 1 - t;
  return [a * a * a, 3 * a * a * t, 3 * a * t * t, t * t * t];
}
function derivativeWeights(t: number): number[] {
  const a = 1 - t;
  return [-3 * a * a, 3 * a * a - 6 * a * t, 6 * a * t - 3 * t * t, 3 * t * t];
}

export function evaluatePatchSpan(
  d: PatchDraft,
  us: number,
  vs: number,
  u: number,
  v: number,
): PatchSample {
  const uw = weights(u),
    vw = weights(v),
    ud = derivativeWeights(u),
    vd = derivativeWeights(v);
  const duSize = d.uBreaks[us + 1] - d.uBreaks[us],
    dvSize = d.vBreaks[vs + 1] - d.vBreaks[vs];
  const p = [0, 0, 0],
    du = [0, 0, 0],
    dv = [0, 0, 0];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const c = d.points[d.grid[3 * vs + j][3 * us + i]];
      for (let k = 0; k < 3; k++) {
        p[k] += c[k] * uw[i] * vw[j];
        du[k] += (c[k] * ud[i] * vw[j]) / duSize;
        dv[k] += (c[k] * uw[i] * vd[j]) / dvSize;
      }
    }
  return { position: p as unknown as Vec3, du: du as unknown as Vec3, dv: dv as unknown as Vec3 };
}

export function evaluatePatch(d: PatchDraft, u: number, v: number): PatchSample {
  const span = (b: readonly number[], t: number) => {
    const i = b.findIndex((n) => n > t);
    return i === -1 ? b.length - 2 : Math.max(0, i - 1);
  };
  const us = span(d.uBreaks, u),
    vs = span(d.vBreaks, v);
  return evaluatePatchSpan(
    d,
    us,
    vs,
    (u - d.uBreaks[us]) / (d.uBreaks[us + 1] - d.uBreaks[us]),
    (v - d.vBreaks[vs]) / (d.vBreaks[vs + 1] - d.vBreaks[vs]),
  );
}

/** Exact de Casteljau split, exported for conservative tiling subdivision too. */
export function splitCubic(c: Cubic, t: number): readonly [Cubic, Cubic] {
  const a = mix(c[0], c[1], t),
    b = mix(c[1], c[2], t),
    e = mix(c[2], c[3], t);
  const f = mix(a, b, t),
    g = mix(b, e, t),
    h = mix(f, g, t);
  return [
    [c[0], a, f, h],
    [h, g, e, c[3]],
  ];
}

export function splitPatch(d: PatchDraft, axis: 'u' | 'v', at: number): DraftResult {
  const error = validatePatch(d);
  if (error) return fail(error);
  const breaks = axis === 'u' ? d.uBreaks : d.vBreaks;
  if (!Number.isFinite(at) || at <= 0 || at >= 1 || breaks.some((t) => Math.abs(t - at) < 1e-8))
    return fail('Insert strictly between existing sections.');
  const s = breaks.findIndex((t) => t > at) - 1;
  const t = (at - breaks[s]) / (breaks[s + 1] - breaks[s]);
  const points = { ...d.points };
  let seq = 0;
  const fresh = (p: Vec3) => {
    while (Object.hasOwn(points, `c${seq}`)) seq++;
    const id = `c${seq++}`;
    points[id] = p;
    return id;
  };
  const source = axis === 'u' ? d.grid : transpose(d.grid);
  const lines = source.map((row) => {
    const ids = row.slice(3 * s, 3 * s + 4);
    const [a, b] = splitCubic(ids.map((id) => points[id]) as unknown as Cubic, t);
    return [
      ...row.slice(0, 3 * s),
      ids[0],
      ...[a[1], a[2], a[3], b[1], b[2]].map(fresh),
      ids[3],
      ...row.slice(3 * s + 4),
    ];
  });
  const nextBreaks = [...breaks];
  nextBreaks.splice(s + 1, 0, at);
  const joins = [...(axis === 'u' ? d.uJoins : d.vJoins)];
  joins.splice(s, 0, 'smooth');
  const grid = axis === 'u' ? lines : transpose(lines);
  const next = {
    ...d,
    points: Object.fromEntries(grid.flat().map((id) => [id, points[id]])),
    grid,
    ...(axis === 'u'
      ? { uBreaks: nextBreaks, uJoins: joins }
      : { vBreaks: nextBreaks, vJoins: joins }),
  };
  const invalid = validatePatch(next);
  return invalid ? fail(invalid) : { ok: true, draft: next };
}

interface Link {
  p: string;
  before: string;
  after: string;
  ratio: number;
}
function links(d: PatchDraft): Link[] {
  const out: Link[] = [];
  for (const axis of ['u', 'v'] as const) {
    const lines = axis === 'u' ? d.grid : transpose(d.grid);
    const breaks = axis === 'u' ? d.uBreaks : d.vBreaks;
    const joins = axis === 'u' ? d.uJoins : d.vJoins;
    joins.forEach((mode, i) => {
      if (mode !== 'smooth') return;
      const k = 3 * (i + 1),
        ratio = (breaks[i + 2] - breaks[i + 1]) / (breaks[i + 1] - breaks[i]);
      for (const line of lines)
        out.push({ p: line[k], before: line[k - 1], after: line[k + 1], ratio });
    });
  }
  return out;
}

/** Infer linked controls once, rejecting conflicting explicit assignments atomically. */
function coupled(d: PatchDraft, requested: Readonly<Record<string, Vec3>>): DraftResult {
  const changed = new Map(Object.entries(requested)),
    constraints = links(d);
  let conflict = false;
  const assign = (id: string, p: Vec3) => {
    const was = changed.get(id);
    if (was) {
      if (!near(was, p)) conflict = true;
      return;
    }
    changed.set(id, p);
  };
  let previous = -1;
  while (previous !== changed.size && !conflict) {
    previous = changed.size;
    for (const { p, before, after, ratio } of constraints) {
      const anchor = changed.get(p) ?? d.points[p];
      if (changed.has(before))
        assign(after, add(anchor, scale(sub(anchor, changed.get(before)!), ratio)));
      if (changed.has(after))
        assign(before, sub(anchor, scale(sub(changed.get(after)!, anchor), 1 / ratio)));
      if (changed.has(p) && !changed.has(before) && !changed.has(after)) {
        const delta = sub(anchor, d.points[p]);
        assign(before, add(d.points[before], delta));
        assign(after, add(d.points[after], delta));
      }
    }
  }
  if (conflict)
    return fail(
      'These control edits conflict across a Smooth join. Move the linked controls together or use a Crease.',
    );
  const points = { ...d.points, ...Object.fromEntries(changed) };
  if (Object.values(points).some((p) => !finite(p)))
    return fail('Surface controls must be finite XYZ positions.');
  return { ok: true, draft: { ...d, points } };
}

export function editPatch(d: PatchDraft, edit: PatchEdit): DraftResult {
  const error = validatePatch(d);
  if (error) return fail(error);
  if (edit.kind === 'remove') return removeSection(d, edit.axis, edit.index);
  if (edit.kind === 'join') {
    const modes = [...(edit.axis === 'u' ? d.uJoins : d.vJoins)];
    if (
      !Number.isInteger(edit.index) ||
      edit.index < 0 ||
      edit.index >= modes.length ||
      (edit.mode !== 'smooth' && edit.mode !== 'crease')
    )
      return fail('Choose an interior join.');
    modes[edit.index] = edit.mode;
    const next = { ...d, ...(edit.axis === 'u' ? { uJoins: modes } : { vJoins: modes }) };
    if (edit.mode === 'crease') return { ok: true, draft: next };
    const lines = edit.axis === 'u' ? d.grid : transpose(d.grid);
    const before = Object.fromEntries(
      lines.map((line) => {
        const id = line[3 * (edit.index + 1) - 1];
        return [id, d.points[id]];
      }),
    );
    return coupled(next, before);
  }
  const entries = Object.entries(edit.positions);
  if (entries.some(([id, p]) => !Object.hasOwn(d.points, id) || !finite(p)))
    return fail('Choose valid finite surface controls.');
  const positions = { ...edit.positions };
  // Anchor/profile moves carry neighbouring handles, including the diagonal controls.
  for (const [id, to] of entries) {
    const r = d.grid.findIndex((row) => row.includes(id)),
      c = d.grid[r].indexOf(id);
    const rs = r % 3 === 0 ? [r - 1, r, r + 1] : [r];
    const cs = c % 3 === 0 ? [c - 1, c, c + 1] : [c];
    const delta = sub(to, d.points[id]);
    for (const j of rs)
      for (const i of cs) {
        const neighbour = d.grid[j]?.[i];
        if (neighbour && !Object.hasOwn(edit.positions, neighbour)) {
          const value = add(d.points[neighbour], delta);
          if (Object.hasOwn(positions, neighbour) && !near(positions[neighbour], value))
            return fail('Selected controls imply conflicting handle offsets.');
          positions[neighbour] = value;
        }
      }
  }
  return coupled(d, positions);
}

function removeSection(d: PatchDraft, axis: 'u' | 'v', index: number): DraftResult {
  const breaks = [...(axis === 'u' ? d.uBreaks : d.vBreaks)];
  if (!Number.isInteger(index) || index <= 0 || index >= breaks.length - 1)
    return fail('Only interior sections can be removed; keep at least two sections.');
  const left = breaks[index] - breaks[index - 1],
    right = breaks[index + 1] - breaks[index];
  const points = { ...d.points },
    source = axis === 'u' ? d.grid : transpose(d.grid);
  const lines = source.map((line) => {
    const k = 3 * index,
      a = line[k - 3],
      b = line[k - 2],
      c = line[k + 2],
      e = line[k + 3];
    points[b] = add(points[a], scale(sub(d.points[b], points[a]), (left + right) / left));
    points[c] = add(points[e], scale(sub(d.points[c], points[e]), (left + right) / right));
    return [...line.slice(0, k - 3), a, b, c, e, ...line.slice(k + 4)];
  });
  breaks.splice(index, 1);
  const joins = [...(axis === 'u' ? d.uJoins : d.vJoins)];
  joins.splice(index - 1, 1);
  const grid = axis === 'u' ? lines : transpose(lines);
  return {
    ok: true,
    draft: {
      ...d,
      grid,
      points: Object.fromEntries(grid.flat().map((id) => [id, points[id]])),
      ...(axis === 'u' ? { uBreaks: breaks, uJoins: joins } : { vBreaks: breaks, vJoins: joins }),
    },
  };
}
