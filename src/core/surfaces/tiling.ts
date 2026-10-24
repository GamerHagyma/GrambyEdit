// GasCap surfaces (spec §13.11, D22): four corners span a bilinear patch, and rows of flat square tiles
// cover it with no gaps. The rows run along corner 1 → 2, or along 2 → 3 when that takes fewer tiles.
// Each row (a band between two lines of constant v) is sliced square to its middle line into cells,
// like bricks, so a slanted edge or a sharp corner costs only a row's end tiles instead of skewing every
// cell. Why no gaps: each tile holds the row's direction and covers, seen along its normal, the points
// where its cell's two slices meet the band's edges, and the band's corners between them. Seen that way
// a slice runs straight across the row between its ends, and the band's lines of constant v are straight
// pieces between the slices, so the tile covers its whole cell, and the cells make up the patch.
import { Matrix4, Vector3 } from 'three';
import type { Vec3 } from '../catalog-types';

/** P0..P3 in order around the edge: P0 → P1 is U, P0 → P3 is V. */
export type Corners = readonly [Vec3, Vec3, Vec3, Vec3];

export interface TileSize {
  /** Along its row: the tile's Z. */
  readonly width: number;
  /** Across its row, in the surface: the tile's Y. */
  readonly height: number;
}

/** One tile: its place in the rows, where its middle is on the patch, and its frame. */
export interface Tile {
  readonly row: number;
  /** Its place along the row; neighbours in a row differ by one. */
  readonly col: number;
  /** Its middle on the patch: u along P0 → P1 and v along P0 → P3, both 0..1. */
  readonly u: number;
  readonly v: number;
  /** X out of the surface, Z along the row, origin on the surface. */
  readonly frame: Matrix4;
}

export type Tiling =
  | { readonly ok: true; readonly rows: number; readonly tiles: readonly Tile[] }
  | { readonly ok: false; readonly error: string };

const TOO_CLOSE = 'The corners are too close together.';
const CROSSED = 'The corners cross over or dent inward; keep them in order around the edge.';

/** The point at (u, v) of the bilinear patch through the corners. */
export function bilinear(corners: Corners, u: number, v: number, out = new Vector3()): Vector3 {
  const [p0, p1, p2, p3] = corners;
  const a = (1 - u) * (1 - v);
  const b = u * (1 - v);
  const c = u * v;
  const d = (1 - u) * v;
  return out.set(
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
    a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
  );
}

/** `mid` kept inside the soft range (its middle when the range is empty), then inside the hard range. */
function place(
  mid: number,
  softLo: number,
  softHi: number,
  hardLo: number,
  hardHi: number,
): number {
  const soft = softLo <= softHi ? Math.min(Math.max(mid, softLo), softHi) : (softLo + softHi) / 2;
  return Math.min(Math.max(soft, hardLo), hardHi);
}

/** A row's tiles; how much taller than a tile its cells are; past the budget; or an error. */
type RowResult =
  | { readonly tiles: Tile[] }
  | { readonly tall: number }
  | { readonly tooMany: true }
  | { readonly error: string };

type UV = readonly [number, number];

/**
 * Row `row` of `rows` (v from row / rows to (row + 1) / rows) in the fewest cells that fit a tile. The
 * slices are even steps along the row's middle line from its first corner to its last; each meets the
 * band's lower edge (its bottom, or an end) and its upper edge once.
 */
function layRow(
  corners: Corners,
  row: number,
  rows: number,
  size: TileSize,
  up: Vector3,
  budget: number,
): RowResult {
  const { width: w, height: h } = size;
  const [v0, v1] = [row / rows, (row + 1) / rows];
  const vc = (v0 + v1) / 2;
  const start = bilinear(corners, 0, vc);
  const along = bilinear(corners, 1, vc).sub(start);
  const length = along.length();
  if (!(length > 1e-9 * w)) return { error: TOO_CLOSE };
  along.divideScalar(length);
  /** How far along the row's middle line a point of the patch lies. */
  const zeta = (u: number, v: number) => bilinear(corners, u, v).sub(start).dot(along);
  const [zB0, zB1, zT0, zT1] = [zeta(0, v0), zeta(1, v0), zeta(0, v1), zeta(1, v1)];
  if (!(zB1 > zB0) || !(zT1 > zT0)) return { error: CROSSED };
  /** How far `s` lies from `z0` towards `z1`, 0..1. */
  const frac = (s: number, z0: number, z1: number) =>
    z1 === z0 ? 0 : Math.min(1, Math.max(0, (s - z0) / (z1 - z0)));
  /** The point at `s` on the band's end at `u`, which runs from `z0` (bottom) to `z1` (top). */
  const end = (u: number, z0: number, z1: number, s: number): UV => [
    u,
    v0 + (v1 - v0) * frac(s, z0, z1),
  ];
  // Where the slice at `s` meets the band's lower edge and its upper edge.
  const lower = (s: number): UV =>
    s < zB0 ? end(0, zB0, zT0, s) : s > zB1 ? end(1, zB1, zT1, s) : [frac(s, zB0, zB1), v0];
  const upper = (s: number): UV =>
    s < zT0 ? end(0, zB0, zT0, s) : s > zT1 ? end(1, zB1, zT1, s) : [frac(s, zT0, zT1), v1];
  const lo = Math.min(zB0, zT0);
  const hi = Math.max(zB1, zT1);
  // The band's corners in order along its lower edge and back along its upper edge.
  const lowerBends: readonly (readonly [number, UV])[] = [
    [zB0, [0, v0]],
    [zB1, [1, v0]],
  ];
  const upperBends: readonly (readonly [number, UV])[] = [
    [zT1, [1, v1]],
    [zT0, [0, v1]],
  ];
  const k = Math.max(1, Math.ceil((hi - lo) / w - 1e-9));
  if (k > budget) return { tooMany: true };
  const tiles: Tile[] = [];
  for (let j = 0; j < k; j++) {
    // The first and last slices are the row's ends exactly.
    const step = (i: number) => (i === 0 ? lo : i === k ? hi : lo + ((hi - lo) * i) / k);
    const [sA, sB] = [step(j), step(j + 1)];
    const between = ([s]: readonly [number, UV]) => s > sA && s < sB;
    // The cell's outline: its slices' ends, and the band's corners between the slices.
    const outline: UV[] = [
      lower(sA),
      ...lowerBends.filter(between).map(([, uv]) => uv),
      lower(sB),
      upper(sB),
      ...upperBends.filter(between).map(([, uv]) => uv),
      upper(sA),
    ];
    const cell = layCell(
      corners,
      outline.map(([u, v]) => bilinear(corners, u, v)),
      along,
      up,
      outline.reduce((sum, [u]) => sum + u, 0) / outline.length,
      vc,
      size,
    );
    if ('error' in cell) return cell;
    if (cell.height > h * (1 + 1e-9)) return { tall: cell.height / h };
    tiles.push({ row, col: j, u: cell.u, v: vc, frame: cell.frame() });
  }
  return { tiles };
}

/** A cell's height across its row, and the tile frame that covers it. */
interface Cell {
  readonly u: number;
  readonly height: number;
  frame(): Matrix4;
}

/**
 * The tile over the cell with this `outline` (around it, the same way as the patch's corners), at `uc`
 * on the row through `vc`. Its Z runs exactly along the row. It covers the cell; it stays inside the
 * row's ends along its middle line, and inside the patch's first and last rows, where it can.
 */
function layCell(
  corners: Corners,
  outline: readonly Vector3[],
  along: Vector3,
  up: Vector3,
  uc: number,
  vc: number,
  { width: w, height: h }: TileSize,
): Cell | { error: string } {
  // Newell's normal: twice the outline's area, out of the side the patch's corners turn about.
  const n = new Vector3();
  outline.forEach((p, i) =>
    n.add(new Vector3().crossVectors(p, outline[(i + 1) % outline.length])),
  );
  if (!(n.length() > 2e-9 * w * h)) return { error: TOO_CLOSE };
  if (n.dot(up) <= 0) return { error: CROSSED };
  // The normal, square to the row, so the tile's Z is the row's own direction.
  const x = n.addScaledVector(along, -n.dot(along));
  if (!(x.lengthSq() > 1e-18)) return { error: CROSSED };
  x.normalize();
  const z = along;
  const y = new Vector3().crossVectors(x, z);
  const c = outline.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(outline.length);
  let [zLo, zHi, yLo, yHi, xLo, xHi] = [
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
    Infinity,
    -Infinity,
  ];
  const t = new Vector3();
  for (const p of outline) {
    t.subVectors(p, c);
    const [pz, py, px] = [t.dot(z), t.dot(y), t.dot(x)];
    [zLo, zHi] = [Math.min(zLo, pz), Math.max(zHi, pz)];
    [yLo, yHi] = [Math.min(yLo, py), Math.max(yHi, py)];
    [xLo, xHi] = [Math.min(xLo, px), Math.max(xHi, px)];
  }
  return {
    u: uc,
    height: yHi - yLo,
    frame() {
      // The row's middle line runs from S(0, vc) to S(1, vc), and the patch's column from S(uc, 0)
      // to S(uc, 1).
      const zA = bilinear(corners, 0, vc, t).sub(c).dot(z);
      const zB = bilinear(corners, 1, vc, t).sub(c).dot(z);
      const yA = bilinear(corners, uc, 0, t).sub(c).dot(y);
      const yB = bilinear(corners, uc, 1, t).sub(c).dot(y);
      const zc = place((zLo + zHi) / 2, zA + w / 2, zB - w / 2, zHi - w / 2, zLo + w / 2);
      const yc = place((yLo + yHi) / 2, yA + h / 2, yB - h / 2, yHi - h / 2, yLo + h / 2);
      const origin = c
        .clone()
        .addScaledVector(z, zc)
        .addScaledVector(y, yc)
        .addScaledVector(x, (xLo + xHi) / 2);
      return new Matrix4().makeBasis(x, new Vector3().crossVectors(z, x), z).setPosition(origin);
    },
  };
}

/**
 * The patch in rows along P0 → P1: the fewest tiles among the first few row counts that fit, or why
 * none does.
 */
function layRows(
  corners: Corners,
  size: TileSize,
  up: Vector3,
  maxTiles: number,
): { ok: true; rows: number; tiles: Tile[] } | { ok: false; error: string; tooMany?: true } {
  const p = corners.map((c) => new Vector3(...c));
  // A lower bound on the rows: the height, as the area (a quarter of `up`, flat) over the mean length.
  const length = (p[0].distanceTo(p[1]) + p[3].distanceTo(p[2])) / 2;
  let rows = Math.max(1, Math.ceil(up.length() / (4 * length) / size.height - 1e-6));
  let best: { rows: number; tiles: Tile[] } | null = null;
  for (let more = 0; rows <= maxTiles && more < 4;) {
    const tiles: Tile[] = [];
    let tall = 1;
    for (let r = 0; r < rows && tall === 1; r++) {
      const res = layRow(corners, r, rows, size, up, maxTiles - tiles.length);
      if ('error' in res) return { ok: false, error: res.error };
      // More rows take more tiles from here on.
      if ('tooMany' in res) {
        return best ? { ok: true, ...best } : { ok: false, error: '', tooMany: true };
      }
      if ('tall' in res) tall = res.tall;
      else tiles.push(...res.tiles);
    }
    if (tall > 1) {
      // Too tall: grow in proportion, and again from there.
      rows = Math.max(rows + 1, Math.ceil(rows * tall));
      continue;
    }
    if (!best || tiles.length < best.tiles.length) best = { rows, tiles };
    more++;
    rows++;
  }
  return best ? { ok: true, ...best } : { ok: false, error: '', tooMany: true };
}

/**
 * Covers the bilinear patch through `corners` with rows of `size` tiles and no gaps, in the fewest
 * tiles this finds. Square edges stay flush; tiles stick out a little past slanted ones (user,
 * 2026-10-24). Fails on corners that coincide, cross or dent inward, or past `maxTiles`.
 */
export function tileQuad(corners: Corners, size: TileSize, maxTiles: number): Tiling {
  const p = corners.map((c) => new Vector3(...c));
  const tiny = 1e-9 * size.width * size.height;
  // Each corner's normal, from its two edges: all on one side unless the corners cross or dent.
  const normals = p.map((c, i) =>
    new Vector3().subVectors(p[(i + 1) % 4], c).cross(new Vector3().subVectors(p[(i + 3) % 4], c)),
  );
  const up = normals.reduce((sum, n) => sum.add(n), new Vector3());
  if (normals.every((n) => !(n.length() > tiny))) return { ok: false, error: TOO_CLOSE };
  if (!(up.length() > tiny) || normals.some((n) => n.length() > tiny && n.dot(up) <= 0)) {
    return { ok: false, error: CROSSED };
  }
  const along = layRows(corners, size, up, maxTiles);
  // The same patch in rows along P1 → P2: corners relabelled 2, 3, 4, 1, so (u', v') = (v, 1 − u).
  const turned = layRows([corners[1], corners[2], corners[3], corners[0]], size, up, maxTiles);
  if (turned.ok && (!along.ok || turned.tiles.length < along.tiles.length)) {
    return {
      ok: true,
      rows: turned.rows,
      tiles: turned.tiles.map((t) => ({ ...t, u: 1 - t.v, v: t.u })),
    };
  }
  if (along.ok) return along;
  if ('tooMany' in along || 'tooMany' in turned) {
    return {
      ok: false,
      error: `This surface needs more than ${maxTiles.toLocaleString('en-US')} GasCaps.`,
    };
  }
  return { ok: false, error: along.error };
}
