// Mating and orientation conventions (spec §10.2–§10.3). Defaults are guesses that calibration replaces.
import { Euler, Matrix4, type Vector3 } from 'three';
import type { Conventions } from './catalog-types';
import { matrix4ToCf } from './cframe';
import type { CFrame12, Json } from './types';

export const DEFAULT_CONVENTIONS: Conventions = {
  mating: 'rx180',
  orientationOrder: 'YXZ',
  orientationOnPoints: true,
  orientationPivot: 'part',
  orientationSigns: [1, -1, 1],
};

const RX180 = new Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);
const RZ180 = new Matrix4().set(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const DEG = Math.PI / 180;

/** `M`: turns the child's outward socket frame to face the parent's. Exact, no float noise. */
export function matingMatrix(c: Conventions): Matrix4 {
  return (c.mating === 'rx180' ? RX180 : RZ180).clone();
}

const angle = (v: Json | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** A catalog built before `orientationSigns` existed gets today's default. */
const signs = (c: Conventions) => c.orientationSigns ?? DEFAULT_CONVENTIONS.orientationSigns;

/**
 * `R`: the child's `OrientationX/Y/Z` (degrees), each turned the convention's way, in its order; missing
 * keys are 0.
 */
export function orientationMatrix(props: Readonly<Record<string, Json>>, c: Conventions): Matrix4 {
  const [sx, sy, sz] = signs(c);
  const x = angle(props.OrientationX) * sx;
  const y = angle(props.OrientationY) * sy;
  const z = angle(props.OrientationZ) * sz;
  const m = new Matrix4();
  if (x === 0 && y === 0 && z === 0) return m;
  return m.makeRotationFromEuler(new Euler(x * DEG, y * DEG, z * DEG, c.orientationOrder));
}

/** The `Orientation` props that `orientationMatrix` turns into `m`: degrees, 4 decimals, no −0. */
export function orientationFromRotation(
  m: Matrix4,
  c: Conventions,
): { x: number; y: number; z: number } {
  const e = new Euler().setFromRotationMatrix(m, c.orientationOrder);
  const [sx, sy, sz] = signs(c);
  const deg = (r: number, s: number) => Number(((r / DEG) * s).toFixed(4)) + 0;
  return { x: deg(e.x, sx), y: deg(e.y, sy), z: deg(e.z, sz) };
}

/** `R` turning about `pivot` (part space): `T(p) · R · T(−p)`. */
function pivoted(r: Matrix4, pivot: Vector3 | undefined): Matrix4 {
  if (!pivot || pivot.lengthSq() === 0) return r;
  return new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(r)
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}

/**
 * A child's world matrix from `at`, the world frame of the parent socket or point it mates with: the
 * one place `R` is applied. `'part'`: `at · M · S(c, a)⁻¹ · T(p) · R · T(−p)`, so `R` turns the child
 * about its own pivot `p` (its origin unless given). `'socket'`: `at · R · M · S(c, a)⁻¹`.
 */
export function mateWorld(
  at: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
  pivot?: Vector3,
): Matrix4 {
  const r = orientationMatrix(childProps, c);
  const mated = matingMatrix(c).multiply(childSocket.clone().invert());
  return c.orientationPivot === 'socket'
    ? at.clone().multiply(r).multiply(mated)
    : at.clone().multiply(mated).multiply(pivoted(r, pivot));
}

/** `World(c)` for a socket joint: `mateWorld(World(q) · S(q, b), …)`. */
export function childWorldViaSocket(
  parentWorld: Matrix4,
  parentSocket: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
  pivot?: Vector3,
): Matrix4 {
  return mateWorld(parentWorld.clone().multiply(parentSocket), childSocket, childProps, c, pivot);
}

/** `World(c)` for a point mount: `mateWorld(World(h) · Sub · CF(u), …)`; `Re` is the identity unless `orientationOnPoints`. */
export function childWorldViaPoint(
  hostWorld: Matrix4,
  subPart: Matrix4,
  point: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
  pivot?: Vector3,
): Matrix4 {
  return mateWorld(
    hostWorld.clone().multiply(subPart).multiply(point),
    childSocket,
    c.orientationOnPoints ? childProps : {},
    c,
    pivot,
  );
}

/** The point frame that seats the child at `childWorld`: the exact inverse of `childWorldViaPoint`. */
export function pointFrameFor(
  hostWorld: Matrix4,
  subPart: Matrix4,
  childWorld: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
  pivot?: Vector3,
): CFrame12 {
  const r = orientationMatrix(c.orientationOnPoints ? childProps : {}, c);
  const unmate = childSocket.clone().multiply(matingMatrix(c).invert());
  const toPoint =
    c.orientationPivot === 'socket'
      ? childWorld.clone().multiply(unmate).multiply(r.invert())
      : childWorld.clone().multiply(pivoted(r.invert(), pivot)).multiply(unmate);
  return matrix4ToCf(hostWorld.clone().multiply(subPart).invert().multiply(toPoint));
}
