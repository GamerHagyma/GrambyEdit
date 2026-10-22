// Mating and orientation conventions (spec §10.2–§10.3). Defaults are guesses that calibration replaces.
import { Euler, Matrix4 } from 'three';
import type { Conventions } from './catalog-types';
import { matrix4ToCf } from './cframe';
import type { CFrame12, Json } from './types';

export const DEFAULT_CONVENTIONS: Conventions = {
  mating: 'rx180',
  orientationOrder: 'XYZ',
  orientationOnPoints: true,
};

const RX180 = new Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);
const RZ180 = new Matrix4().set(-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const DEG = Math.PI / 180;

/** `M`: turns the child's outward socket frame to face the parent's. Exact, no float noise. */
export function matingMatrix(c: Conventions): Matrix4 {
  return (c.mating === 'rx180' ? RX180 : RZ180).clone();
}

const angle = (v: Json | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** `R`: the child's `OrientationX/Y/Z` (degrees) about the parent socket's axes; missing keys are 0. */
export function orientationMatrix(props: Readonly<Record<string, Json>>, c: Conventions): Matrix4 {
  const x = angle(props.OrientationX);
  const y = angle(props.OrientationY);
  const z = angle(props.OrientationZ);
  const m = new Matrix4();
  if (x === 0 && y === 0 && z === 0) return m;
  return m.makeRotationFromEuler(new Euler(x * DEG, y * DEG, z * DEG, c.orientationOrder));
}

/** `World(c) = World(q) · S(q, b) · R(c) · M · S(c, a)⁻¹`. */
export function childWorldViaSocket(
  parentWorld: Matrix4,
  parentSocket: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
): Matrix4 {
  return parentWorld
    .clone()
    .multiply(parentSocket)
    .multiply(orientationMatrix(childProps, c))
    .multiply(matingMatrix(c))
    .multiply(childSocket.clone().invert());
}

/** `World(c) = World(h) · Sub · CF(u) · Re(c) · M · S(c, a)⁻¹`; `Re` is the identity unless `orientationOnPoints`. */
export function childWorldViaPoint(
  hostWorld: Matrix4,
  subPart: Matrix4,
  point: Matrix4,
  childSocket: Matrix4,
  childProps: Readonly<Record<string, Json>>,
  c: Conventions,
): Matrix4 {
  return childWorldViaSocket(
    hostWorld.clone().multiply(subPart),
    point,
    childSocket,
    c.orientationOnPoints ? childProps : {},
    c,
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
): CFrame12 {
  const re = orientationMatrix(c.orientationOnPoints ? childProps : {}, c);
  return matrix4ToCf(
    hostWorld
      .clone()
      .multiply(subPart)
      .invert()
      .multiply(childWorld)
      .multiply(childSocket)
      .multiply(matingMatrix(c).invert())
      .multiply(re.invert()),
  );
}
