// Curved guide coverage by rigid native plates. Hull bounds certify coverage;
// a second, wider bound rejects bends that a whole plate cannot follow.
import { Matrix4, Vector3 } from 'three';
import type { Vec3 } from '../catalog-types';
import type { CapSize } from './build';
import {
  evaluatePatch,
  evaluatePatchSpan,
  splitCubic,
  validatePatch,
  type Cubic,
  type PatchDraft,
} from './patches';
import type { Tile } from './tiling';

export interface CurvedOptions {
  readonly maxElements: number;
  readonly maxAssignedDeviation?: number;
  readonly maxFootprintDeviation?: number;
  readonly maxDepth?: number;
  readonly poseForValidation?: (frame: Matrix4, tile: Tile) => Matrix4;
  readonly cancelled?: () => boolean;
  readonly yieldControl?: () => Promise<void>;
}
export interface CurvedDiagnostics {
  readonly maxAssignedDeviation: number;
  readonly maxFootprintDeviation: number;
  readonly minProjectionStretch: number;
  readonly boundaryTiles: number;
  readonly creaseTiles: number;
}
export type CurvedFailure = 'invalid' | 'uncertified' | 'resolution-limit' | 'budget' | 'cancelled';
export type CurvedResult =
  | {
      readonly ok: true;
      readonly rows: number;
      readonly tiles: readonly Tile[];
      readonly diagnostics: CurvedDiagnostics;
    }
  | { readonly ok: false; readonly code: CurvedFailure; readonly error: string };
type Net = readonly (readonly Vec3[])[];
type Region = readonly [number, number, number, number]; // U0,U1,V0,V1
interface Cell {
  region: Region;
  domain: Region;
  row: number;
  col: number;
  depth: number;
}
const EPS = 1e-9;
const fail = (code: CurvedFailure, error: string): CurvedResult => ({ ok: false, code, error });
const vector = (p: Vec3) => new Vector3(...p);
const transpose = (g: Net): Vec3[][] => g[0].map((_, i) => g.map((r) => r[i]));
function restricted(c: Cubic, lo: number, hi: number): Cubic {
  const left = hi < 1 ? splitCubic(c, hi)[0] : c;
  return lo > 0 ? splitCubic(left, lo / hi)[1] : left;
}
function restrictNet(net: Net, u0: number, u1: number, v0: number, v1: number): Net {
  const u = net.map((r) => restricted(r as Cubic, u0, u1));
  return transpose(transpose(u).map((r) => restricted(r as unknown as Cubic, v0, v1)));
}
function spanNet(d: PatchDraft, u: number, v: number): Net {
  return d.grid
    .slice(3 * v, 3 * v + 4)
    .map((r) => r.slice(3 * u, 3 * u + 4).map((id) => d.points[id]));
}
function regionControls(d: PatchDraft, [u0, u1, v0, v1]: Region): Vec3[] {
  const out: Vec3[] = [];
  for (let v = 0; v < d.vBreaks.length - 1; v++) {
    const a = Math.max(v0, d.vBreaks[v]),
      b = Math.min(v1, d.vBreaks[v + 1]);
    if (b <= a + EPS) continue;
    for (let u = 0; u < d.uBreaks.length - 1; u++) {
      const c = Math.max(u0, d.uBreaks[u]),
        e = Math.min(u1, d.uBreaks[u + 1]);
      if (e <= c + EPS) continue;
      const du = d.uBreaks[u + 1] - d.uBreaks[u],
        dv = d.vBreaks[v + 1] - d.vBreaks[v];
      out.push(
        ...restrictNet(
          spanNet(d, u, v),
          (c - d.uBreaks[u]) / du,
          (e - d.uBreaks[u]) / du,
          (a - d.vBreaks[v]) / dv,
          (b - d.vBreaks[v]) / dv,
        ).flat(),
      );
    }
  }
  return out;
}
function derivatives(net: Net, du: number, dv: number): readonly [Vector3[], Vector3[]] {
  const u: Vector3[] = [],
    v: Vector3[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 3; i++)
      u.push(
        vector(net[j][i + 1])
          .sub(vector(net[j][i]))
          .multiplyScalar(3 / du),
      );
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 4; i++)
      v.push(
        vector(net[j + 1][i])
          .sub(vector(net[j][i]))
          .multiplyScalar(3 / dv),
      );
  return [u, v];
}
const maximum = (points: readonly Vector3[]) => Math.max(...points.map((p) => p.length()));

// Dual coordinates in the initial corner plane. Strong monotonicity of this
// 2D projection proves global injectivity, including between distant patches.
function projection(d: PatchDraft): readonly [Vector3, Vector3] | null {
  const p = vector(d.points[d.grid[0][0]]);
  const u = vector(d.points[d.grid[0].at(-1)!]).sub(p);
  const v = vector(d.points[d.grid.at(-1)![0]]).sub(p);
  const a = u.lengthSq(),
    b = u.dot(v),
    c = v.lengthSq(),
    det = a * c - b * b;
  if (!Number.isFinite(det) || det < 1e-12) return null;
  return [
    u.clone().multiplyScalar(c).addScaledVector(v, -b).divideScalar(det),
    v.clone().multiplyScalar(a).addScaledVector(u, -b).divideScalar(det),
  ];
}
function stretchBound(
  du: readonly Vector3[],
  dv: readonly Vector3[],
  [x, y]: readonly [Vector3, Vector3],
): number {
  const a = Math.min(...du.map((p) => p.dot(x)));
  const c = Math.min(...dv.map((p) => p.dot(y)));
  const b = du.map((p) => p.dot(y)),
    e = dv.map((p) => p.dot(x));
  const off =
    Math.max(Math.abs(Math.min(...b) + Math.min(...e)), Math.abs(Math.max(...b) + Math.max(...e))) /
    2;
  return (a + c - Math.hypot(a - c, 2 * off)) / 2;
}
function localBounds(points: readonly Vec3[], inverse: Matrix4): readonly [Vector3, Vector3] {
  const lo = new Vector3(Infinity, Infinity, Infinity),
    hi = lo.clone().negate();
  for (const p of points) {
    const q = vector(p).applyMatrix4(inverse);
    lo.min(q);
    hi.max(q);
  }
  return [lo, hi];
}
const normalBound = ([lo, hi]: readonly [Vector3, Vector3]) =>
  Math.max(Math.abs(lo.x), Math.abs(hi.x));
const touches = (a: number, b: number) => Math.abs(a - b) < EPS;
function cuts(count: number, breaks: readonly number[], joins: readonly string[]): number[] {
  const values = Array.from({ length: count + 1 }, (_, i) => i / count);
  joins.forEach((mode, i) => {
    if (mode === 'crease') values.push(breaks[i + 1]);
  });
  return values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > EPS);
}
function domainAt(
  t: number,
  breaks: readonly number[],
  joins: readonly string[],
): readonly [number, number] {
  let lo = 0,
    hi = 1;
  joins.forEach((mode, i) => {
    if (mode !== 'crease') return;
    const k = breaks[i + 1];
    if (k < t) lo = k;
    else if (k > t && k < hi) hi = k;
  });
  return [lo, hi];
}
class Cancelled extends Error {}

/** A small recess avoids exposing differently colored end faces at right-angle ridges. */
function creaseExtension(
  d: PatchDraft,
  axis: 'u' | 'v',
  at: number,
  other: number,
  before: boolean,
  tangent: Vector3,
  thickness: number,
  pad: number,
): number {
  const breaks = axis === 'u' ? d.uBreaks : d.vBreaks;
  const joins = axis === 'u' ? d.uJoins : d.vJoins;
  const k = breaks.findIndex((b) => touches(b, at));
  if (k <= 0 || k === breaks.length - 1 || joins[k - 1] !== 'crease') return pad;
  const transverse = axis === 'u' ? d.vBreaks : d.uBreaks;
  const found = transverse.findIndex((b) => b > other);
  const j = found === -1 ? transverse.length - 2 : Math.max(0, found - 1);
  const t = (other - transverse[j]) / (transverse[j + 1] - transverse[j]);
  const a =
    axis === 'u' ? evaluatePatchSpan(d, k - 1, j, 1, t) : evaluatePatchSpan(d, j, k - 1, t, 1);
  const b = axis === 'u' ? evaluatePatchSpan(d, k, j, 0, t) : evaluatePatchSpan(d, j, k, t, 0);
  const na = vector(a.du).cross(vector(a.dv)).normalize(),
    nb = vector(b.du).cross(vector(b.dv)).normalize();
  const cosine = na.dot(nb),
    denominator = 1 + cosine;
  if (denominator < 1e-6) return Infinity;
  const offset = na.add(nb).multiplyScalar(thickness / (2 * denominator));
  const sample = before ? a : b;
  const toward = vector(axis === 'u' ? sample.du : sample.dv)
    .normalize()
    .multiplyScalar(before ? 1 : -1);
  // Concave joins naturally hide the overlap; insetting them would open the guide.
  if (offset.dot(toward) <= 0) return pad;
  const extension = Math.abs(offset.dot(tangent));
  if (extension > thickness) return Infinity;
  // Rectangular ends cannot form a general trimmed miter. Retain conservative
  // overlap outside the right-angle case verified by the native fixtures.
  if (Math.abs(cosine) > 1e-3) return pad;
  return Math.max(pad, extension - Math.min(0.005, thickness * 0.05));
}

export async function tileCurved(
  d: PatchDraft,
  cap: CapSize,
  options: CurvedOptions,
): Promise<CurvedResult> {
  const invalid = validatePatch(d);
  if (invalid) return fail('invalid', invalid);
  if (
    ![cap.width, cap.height, cap.thickness].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isSafeInteger(options.maxElements) ||
    options.maxElements < 1 ||
    options.maxElements > 20_000
  )
    return fail('invalid', 'Use positive native cap sizes and a cap budget from 1 to 20,000.');
  const assignedLimit = options.maxAssignedDeviation ?? cap.thickness * 0.45;
  const footprintLimit = options.maxFootprintDeviation ?? cap.thickness;
  const maxDepth = options.maxDepth ?? 8;
  if (
    ![assignedLimit, footprintLimit].every((n) => Number.isFinite(n) && n > 0) ||
    assignedLimit >= cap.thickness / 2 ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 1 ||
    maxDepth > 12
  )
    return fail('invalid', 'Invalid native-plate quality or refinement limits.');
  const proj = projection(d);
  if (!proj) return fail('uncertified', 'The surface needs a non-degenerate, ordered footprint.');
  let ticks = 0;
  const checkpoint = async () => {
    if (options.cancelled?.()) throw new Cancelled();
    if (++ticks % 64 === 0) {
      await options.yieldControl?.();
      if (options.cancelled?.()) throw new Cancelled();
    }
  };
  try {
    let maxU = 0,
      maxV = 0,
      minStretch = Infinity;
    const pending: { net: Net; du: number; dv: number; depth: number }[] = [];
    for (let v = 0; v < d.vBreaks.length - 1; v++)
      for (let u = 0; u < d.uBreaks.length - 1; u++) {
        const net = spanNet(d, u, v),
          du = d.uBreaks[u + 1] - d.uBreaks[u],
          dv = d.vBreaks[v + 1] - d.vBreaks[v];
        const ds = derivatives(net, du, dv);
        maxU = Math.max(maxU, maximum(ds[0]));
        maxV = Math.max(maxV, maximum(ds[1]));
        pending.push({ net, du, dv, depth: 0 });
      }
    let refinements = 0;
    while (pending.length) {
      await checkpoint();
      const cell = pending.pop()!,
        ds = derivatives(cell.net, cell.du, cell.dv);
      const lower = stretchBound(ds[0], ds[1], proj);
      if (lower > 1e-6) {
        minStretch = Math.min(minStretch, lower);
        continue;
      }
      if (cell.depth >= maxDepth || ++refinements > 16_384)
        return fail(
          'uncertified',
          'This surface folds, turns back, or is too close to singular to tile safely. Keep its projected profiles ordered.',
        );
      for (const u of [0, 0.5])
        for (const v of [0, 0.5])
          pending.push({
            net: restrictNet(cell.net, u, u + 0.5, v, v + 0.5),
            du: cell.du / 2,
            dv: cell.dv / 2,
            depth: cell.depth + 1,
          });
    }
    const nu = Math.max(1, Math.ceil(maxU / (cap.width * 0.8)));
    const nv = Math.max(1, Math.ceil(maxV / (cap.height * 0.8)));
    if (!Number.isFinite(nu * nv) || nu * nv > options.maxElements)
      return fail(
        'budget',
        'This curved surface exceeds the GasCap budget. Reduce its size or curvature.',
      );
    const uc = cuts(nu, d.uBreaks, d.uJoins),
      vc = cuts(nv, d.vBreaks, d.vJoins);
    if ((uc.length - 1) * (vc.length - 1) > options.maxElements)
      return fail('budget', 'The crease rows exceed the GasCap budget.');
    const cells: Cell[] = [];
    for (let j = vc.length - 2; j >= 0; j--)
      for (let i = uc.length - 2; i >= 0; i--) {
        const [u0, u1] = domainAt((uc[i] + uc[i + 1]) / 2, d.uBreaks, d.uJoins);
        const [v0, v1] = domainAt((vc[j] + vc[j + 1]) / 2, d.vBreaks, d.vJoins);
        cells.push({
          region: [uc[i], uc[i + 1], vc[j], vc[j + 1]],
          domain: [u0, u1, v0, v1],
          row: j,
          col: i,
          depth: 0,
        });
      }
    const tiles: Tile[] = [];
    const diagnostics = {
      maxAssignedDeviation: 0,
      maxFootprintDeviation: 0,
      minProjectionStretch: minStretch,
      boundaryTiles: 0,
      creaseTiles: 0,
    };
    while (cells.length) {
      await checkpoint();
      const cell = cells.pop()!,
        [u0, u1, v0, v1] = cell.region;
      const u = (u0 + u1) / 2,
        v = (v0 + v1) / 2,
        s = evaluatePatch(d, u, v);
      const z = vector(s.du).normalize(),
        normal = vector(s.du).cross(vector(s.dv)).normalize(),
        y = z.clone().cross(normal).normalize();
      const frame = new Matrix4().makeBasis(normal, y, z).setPosition(vector(s.position));
      const controls = regionControls(d, cell.region);
      const [lo, hi] = localBounds(controls, frame.clone().invert());
      // Move an edge plate within its coverage interval to reduce boundary/crease overhang.
      const clamp = (n: number, low: number, high: number) =>
        low <= high ? Math.max(low, Math.min(high, n)) : 0;
      const edgeU0 = touches(u0, cell.domain[0]),
        edgeU1 = touches(u1, cell.domain[1]);
      const edgeV0 = touches(v0, cell.domain[2]),
        edgeV1 = touches(v1, cell.domain[3]);
      // An exactly flush boundary can open after rounding the native point pose.
      // Reserve a small overlap; validation still rejects precision too coarse for it.
      const pad = Math.min(0.005, cap.width * 0.01, cap.height * 0.01);
      const extU0 = edgeU0 ? creaseExtension(d, 'u', u0, v, false, z, cap.thickness, pad) : pad;
      const extU1 = edgeU1 ? creaseExtension(d, 'u', u1, v, true, z, cap.thickness, pad) : pad;
      const extV0 = edgeV0 ? creaseExtension(d, 'v', v0, u, false, y, cap.thickness, pad) : pad;
      const extV1 = edgeV1 ? creaseExtension(d, 'v', v1, u, true, y, cap.thickness, pad) : pad;
      if (![extU0, extU1, extV0, extV1].every((n) => Number.isFinite(n) && n <= footprintLimit))
        return fail(
          'resolution-limit',
          'This crease is too tight for full-thickness native GasCaps.',
        );
      const dz = clamp(
        edgeU0 && !edgeU1
          ? lo.z + cap.width / 2 - extU0
          : edgeU1 && !edgeU0
            ? hi.z - cap.width / 2 + extU1
            : 0,
        hi.z - cap.width / 2,
        lo.z + cap.width / 2,
      );
      const dy = clamp(
        edgeV0 && !edgeV1
          ? hi.y - cap.height / 2 + extV0
          : edgeV1 && !edgeV0
            ? lo.y + cap.height / 2 - extV1
            : 0,
        hi.y - cap.height / 2,
        lo.y + cap.height / 2,
      );
      frame.setPosition(vector(s.position).addScaledVector(z, dz).addScaledVector(y, dy));
      const tile: Tile = { frame, u, v, row: cell.row, col: cell.col };
      const actual = options.poseForValidation?.(frame.clone(), tile) ?? frame;
      if (!actual.elements.every(Number.isFinite) || Math.abs(actual.determinant()) < 1e-8)
        return fail('invalid', 'Export precision produced an invalid GasCap pose.');
      const inverse = actual.clone().invert(),
        bounds = localBounds(controls, inverse);
      const deviation = normalBound(bounds);
      const fits =
        bounds[0].y >= -cap.height / 2 - EPS &&
        bounds[1].y <= cap.height / 2 + EPS &&
        bounds[0].z >= -cap.width / 2 - EPS &&
        bounds[1].z <= cap.width / 2 + EPS;
      // Strong monotonicity bounds every point whose base-plane projection lies under this
      // native footprint. Bound that whole neighbourhood, not only the assigned tiny cell.
      let radius = 0;
      for (const x of [-0.5, 0.5])
        for (const a of [-0.5, 0.5])
          for (const b of [-0.5, 0.5]) {
            const offset = new Vector3(x * cap.thickness, a * cap.height, b * cap.width)
              .applyMatrix4(actual)
              .sub(vector(s.position));
            radius = Math.max(
              radius,
              Math.hypot(offset.dot(proj[0]), offset.dot(proj[1])) / minStretch,
            );
          }
      const expanded: Region = [
        Math.max(cell.domain[0], u - radius),
        Math.min(cell.domain[1], u + radius),
        Math.max(cell.domain[2], v - radius),
        Math.min(cell.domain[3], v + radius),
      ];
      const footprintDeviation = normalBound(localBounds(regionControls(d, expanded), inverse));
      if (footprintDeviation > footprintLimit + EPS)
        return fail(
          'resolution-limit',
          'This bend is too tight for a whole native GasCap. Flatten the profile or widen the curve.',
        );
      if (!fits || deviation > assignedLimit + EPS) {
        if (cell.depth >= maxDepth)
          return fail(
            'resolution-limit',
            'The native GasCaps cannot cover this surface at the chosen export precision.',
          );
        const splitU =
          (bounds[1].z - bounds[0].z) / cap.width >= (bounds[1].y - bounds[0].y) / cap.height;
        const halves: Region[] = splitU
          ? [
              [u0, u, v0, v1],
              [u, u1, v0, v1],
            ]
          : [
              [u0, u1, v0, v],
              [u0, u1, v, v1],
            ];
        for (const region of halves.reverse())
          cells.push({ ...cell, region, depth: cell.depth + 1 });
        if (cells.length + tiles.length > options.maxElements)
          return fail('budget', 'Coverage refinement exceeds the GasCap budget.');
        continue;
      }
      diagnostics.maxAssignedDeviation = Math.max(diagnostics.maxAssignedDeviation, deviation);
      diagnostics.maxFootprintDeviation = Math.max(
        diagnostics.maxFootprintDeviation,
        footprintDeviation,
      );
      if (edgeU0 || edgeU1 || edgeV0 || edgeV1) diagnostics.boundaryTiles++;
      if (
        (edgeU0 && cell.domain[0] > 0) ||
        (edgeU1 && cell.domain[1] < 1) ||
        (edgeV0 && cell.domain[2] > 0) ||
        (edgeV1 && cell.domain[3] < 1)
      )
        diagnostics.creaseTiles++;
      tiles.push(tile);
    }
    return { ok: true, rows: vc.length - 1, tiles, diagnostics };
  } catch (error) {
    if (error instanceof Cancelled) return fail('cancelled', 'Surface generation cancelled.');
    throw error;
  }
}
