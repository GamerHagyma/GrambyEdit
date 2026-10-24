import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Vec3 } from '../../../src/core/catalog-types';
import { bilinear, tileQuad, type Corners, type Tile } from '../../../src/core/surfaces/tiling';

/** A GasCap's face, in studs. */
const W = 0.6446;
const SIZE = { width: W, height: W };

const column = (m: Matrix4, i: number) => new Vector3().setFromMatrixColumn(m, i);
const origin = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);

/** `p` relative to the tile: along its Z (U), Y and X (the normal). */
function local(t: Tile, p: Vector3): { z: number; y: number; x: number } {
  const d = p.clone().sub(origin(t.frame));
  return {
    z: d.dot(column(t.frame, 2)),
    y: d.dot(column(t.frame, 1)),
    x: d.dot(column(t.frame, 0)),
  };
}

const covers = (t: Tile, p: Vector3) => {
  const l = local(t, p);
  return Math.abs(l.z) <= W / 2 + 1e-6 && Math.abs(l.y) <= W / 2 + 1e-6 && Math.abs(l.x) <= 0.2;
};

/** Every sample of the patch lies inside some tile. */
function expectCovered(corners: Corners, tiles: readonly Tile[], n = 60) {
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const [u, v] = [i / n, j / n];
      const p = bilinear(corners, u, v);
      if (!tiles.some((t) => covers(t, p))) throw new Error(`gap at u=${u}, v=${v}`);
    }
  }
}

/** A flat rectangle in the XZ plane, U along +X and V along −Z, so the normal is +Y. */
const rect = (a: number, b: number): Corners => [
  [0, 0, 0],
  [a, 0, 0],
  [a, 0, -b],
  [0, 0, -b],
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('a rectangle takes whole caps edge to edge, flush with every edge', () => {
  const r = tileQuad(rect(3 * W, 2 * W), SIZE, 1000);
  if (!r.ok) throw new Error(r.error);
  expect([r.tiles.length, r.rows]).toEqual([6, 2]);
  for (const t of r.tiles) {
    expect(column(t.frame, 0).y).toBeCloseTo(1, 9);
    expect(column(t.frame, 2).x).toBeCloseTo(1, 9);
    // Orthonormal: a rotation with unit scale.
    expect(t.frame.determinant()).toBeCloseTo(1, 9);
  }
  const xs = r.tiles.map((t) => origin(t.frame).x);
  const zs = r.tiles.map((t) => origin(t.frame).z);
  expect(Math.min(...xs) - W / 2).toBeCloseTo(0, 9);
  expect(Math.max(...xs) + W / 2).toBeCloseTo(3 * W, 9);
  expect(Math.max(...zs) + W / 2).toBeCloseTo(0, 9);
  expect(Math.min(...zs) - W / 2).toBeCloseTo(-2 * W, 9);
  expectCovered(rect(3 * W, 2 * W), r.tiles);
});

test('a size between whole caps overlaps the caps and keeps the outer ones flush', () => {
  const r = tileQuad(rect(2.5 * W, W), SIZE, 1000);
  if (!r.ok) throw new Error(r.error);
  expect([r.tiles.length, r.rows]).toEqual([3, 1]);
  const xs = r.tiles.map((t) => origin(t.frame).x);
  expect(xs[0] - W / 2).toBeCloseTo(0, 9);
  expect(xs[2] + W / 2).toBeCloseTo(2.5 * W, 9);
  for (const t of r.tiles) expect(origin(t.frame).z).toBeCloseTo(-W / 2, 9);
  expectCovered(rect(2.5 * W, W), r.tiles);
});

test('random flat and twisted surfaces have no gaps', () => {
  const rand = mulberry32(7);
  for (let k = 0; k < 40; k++) {
    const side = W * (1 + 5 * rand());
    const jitter = () => (rand() * 2 - 1) * 0.2 * side;
    const lift = () => (k % 2 === 1 ? (rand() * 2 - 1) * 0.25 * side : 0);
    const turn = new Quaternion().setFromAxisAngle(
      new Vector3(rand(), rand(), rand()).normalize(),
      rand() * Math.PI,
    );
    const shift = new Vector3(rand() * 10, rand() * 10, rand() * 10);
    const corners = (
      [
        [0, 0],
        [side, 0],
        [side, -side],
        [0, -side],
      ] as const
    ).map(([x, z]) => {
      const p = new Vector3(x + jitter(), lift(), z + jitter()).applyQuaternion(turn).add(shift);
      return [p.x, p.y, p.z] as Vec3;
    }) as unknown as Corners;
    const r = tileQuad(corners, SIZE, 10_000);
    if (!r.ok) throw new Error(`quad ${k}: ${r.error}`);
    expectCovered(corners, r.tiles);
  }
});

test('a tapered surface keeps its parallel edges flush; only the end caps cross its slanted sides', () => {
  // Bottom 4 caps, top 2 caps, 2 caps tall, symmetric.
  const corners: Corners = [
    [0, 0, 0],
    [4 * W, 0, 0],
    [3 * W, 0, -2 * W],
    [W, 0, -2 * W],
  ];
  const r = tileQuad(corners, SIZE, 1000);
  if (!r.ok) throw new Error(r.error);
  expect(r.rows).toBe(2);
  expectCovered(corners, r.tiles);
  const last = (row: number) => Math.max(...r.tiles.filter((t) => t.row === row).map((t) => t.col));
  for (const t of r.tiles) {
    const at = origin(t.frame);
    if (t.row === 0) expect(at.z - -W / 2).toBeCloseTo(0, 9);
    if (t.row === r.rows - 1) expect(at.z - (-2 * W + W / 2)).toBeCloseTo(0, 9);
    if (t.col === 0 || t.col === last(t.row)) continue;
    // Inside its row: the slanted sides run from x = 0 to W (left) and 4W to 3W (right).
    const v = -at.z / (2 * W);
    expect(at.x - W / 2).toBeGreaterThanOrEqual(v * W - 1e-9);
    expect(at.x + W / 2).toBeLessThanOrEqual(4 * W - v * W + 1e-9);
  }
});

test('corners that coincide, cross or need too many caps are refused', () => {
  const same: Corners = [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ];
  expect(tileQuad(same, SIZE, 1000)).toEqual({
    ok: false,
    error: 'The corners are too close together.',
  });
  const crossed = 'The corners cross over or dent inward; keep them in order around the edge.';
  const [p0, p1, p2, p3] = rect(3 * W, 2 * W);
  expect(tileQuad([p0, p2, p1, p3], SIZE, 1000)).toEqual({ ok: false, error: crossed });
  // A dart: corner 3 pushed in past the line from corner 2 to corner 4.
  expect(tileQuad([p0, p1, [W, 0, -0.5 * W], p3], SIZE, 1000)).toEqual({
    ok: false,
    error: crossed,
  });
  expect(tileQuad(rect(3 * W, 2 * W), SIZE, 3)).toEqual({
    ok: false,
    error: 'This surface needs more than 3 GasCaps.',
  });
});

test('steep, skewed and sharp surfaces take caps for their area, not their slant', () => {
  // Each was 3 to 20 times its area in caps when every cell followed the slant (user, 2026-10-24).
  for (const [corners, most] of [
    // One corner of a 4-stud square raised 6 studs.
    [
      [
        [0, 0, 0],
        [4, 0, 0],
        [4, 6, 4],
        [0, 0, 4],
      ],
      110,
    ],
    // A 4 × 2 parallelogram leaning 4 studs.
    [
      [
        [0, 0, 0],
        [4, 0, 0],
        [8, 0, 2],
        [4, 0, 2],
      ],
      30,
    ],
    // A long panel coming to a 20° point, like the user's.
    [
      [
        [0, 0, 0],
        [8, 0, 0],
        [8.5, 0, 2.5],
        [7, 0, 2.6],
      ],
      50,
    ],
  ] as const) {
    const r = tileQuad(corners as unknown as Corners, SIZE, 10_000);
    if (!r.ok) throw new Error(r.error);
    expect(r.tiles.length).toBeLessThanOrEqual(most);
    expectCovered(corners as unknown as Corners, r.tiles);
  }
});

test('random skewed, sharp and twisted surfaces have no gaps', () => {
  const rand = mulberry32(11);
  let laid = 0;
  for (let k = 0; k < 60; k++) {
    const s = W * (1 + 6 * rand());
    const flat = [
      [0, 0],
      [s * (0.5 + rand()), 0],
      [s * (0.2 + 1.5 * rand()), s * (0.3 + rand())],
      [s * (rand() - 0.5), s * (0.3 + rand())],
    ];
    const lift = k % 3 === 0 ? 0 : 0.6 * s;
    const turn = new Quaternion().setFromAxisAngle(
      new Vector3(rand(), rand(), rand()).normalize(),
      rand() * Math.PI,
    );
    const corners = flat.map(([x, z]) => {
      const p = new Vector3(x, (rand() * 2 - 1) * lift, z).applyQuaternion(turn);
      return [p.x, p.y, p.z] as Vec3;
    }) as unknown as Corners;
    const r = tileQuad(corners, SIZE, 10_000);
    // Some of these corners cross or dent, which is refused.
    if (!r.ok) {
      expect(r.error).toMatch(/cross over or dent/);
      continue;
    }
    laid++;
    for (const t of r.tiles) expect(t.frame.determinant()).toBeCloseTo(1, 9);
    expectCovered(corners, r.tiles, 30);
  }
  expect(laid).toBeGreaterThan(30);
});
