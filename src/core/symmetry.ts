// Symmetry transforms stay outside the document. Reflected placement frames must remain rotations.
import { Euler, Matrix4, Vector3 } from 'three';
import type { Catalog } from './catalog-types';
import { cfToMatrix4 } from './cframe';
import { isServo } from './servo-simulation';
export type SymmetryAxis = 'x' | 'y' | 'z';
export type SymmetryMode = 'plane' | 'radial';
export const axisVector = (axis: SymmetryAxis) =>
  new Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
export function symmetryFrame(
  anchor: Matrix4,
  axis: SymmetryAxis,
  offset: number,
  rotation: readonly number[],
): Matrix4 {
  if (![offset, ...rotation].every(Number.isFinite) || rotation.length !== 3)
    throw new Error('Invalid mirror frame.');
  const turn = new Matrix4().makeRotationFromEuler(
    new Euler(...(rotation.map((v) => (v * Math.PI) / 180) as [number, number, number])),
  );
  const shift = axisVector(axis).multiplyScalar(offset);
  return anchor
    .clone()
    .multiply(turn)
    .multiply(new Matrix4().makeTranslation(shift.x, shift.y, shift.z));
}
export function symmetryTransforms(
  frame: Matrix4,
  mode: SymmetryMode,
  axis: SymmetryAxis,
  count: number,
): Matrix4[] {
  if (!Number.isInteger(count) || count < 2 || count > 16)
    throw new Error('Radial sectors must be between 2 and 16.');
  const inverse = frame.clone().invert();
  const local =
    mode === 'plane'
      ? [
          new Matrix4().makeScale(
            axis === 'x' ? -1 : 1,
            axis === 'y' ? -1 : 1,
            axis === 'z' ? -1 : 1,
          ),
        ]
      : Array.from({ length: count - 1 }, (_, i) =>
          new Matrix4().makeRotationAxis(axisVector(axis), ((i + 1) * 2 * Math.PI) / count),
        );
  return local.map((m) => frame.clone().multiply(m).multiply(inverse));
}
export const mirroredType = (type: string) =>
  ({ DoorA: 'DoorB', DoorB: 'DoorA', DoorC: 'DoorD', DoorD: 'DoorC' })[type] ?? type;
export function localReflection(type: string, pivot = new Vector3()): Matrix4 {
  const scale = isServo(type)
    ? new Matrix4().makeScale(1, -1, 1)
    : new Matrix4().makeScale(-1, 1, 1);
  return new Matrix4()
    .makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(scale)
    .multiply(new Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
}
export function copyFrame(
  transform: Matrix4,
  world: Matrix4,
  type: string,
  pivot?: Vector3,
): Matrix4 {
  const m = transform.clone().multiply(world);
  return transform.determinant() < 0 ? m.multiply(localReflection(type, pivot)) : m;
}
export function sameFrame(a: Matrix4, b: Matrix4, epsilon = 0.0001): boolean {
  return a.elements.every((v, i) => Math.abs(v - b.elements[i]) < epsilon);
}
/** Map corresponding native faces, preserving socket roles and body identity. */
export function reflectedSocket(cat: Catalog, type: string, socket: string): string {
  const def = cat.parts[type],
    target = cat.parts[mirroredType(type)],
    s = def?.sockets[socket];
  if (!s || !target) return socket;
  const body = def.bodies?.find((b) => b.sockets.includes(socket));
  const reflect = localReflection(type, body ? new Vector3(...body.pivot) : undefined);
  const m = cfToMatrix4(s.frame),
    p = new Vector3().setFromMatrixPosition(m).applyMatrix4(reflect),
    n = new Vector3().setFromMatrixColumn(m, 1).transformDirection(reflect);
  let best = socket,
    error = Infinity;
  for (const [key, candidate] of Object.entries(target.sockets)) {
    if (candidate.role !== s.role || (body && !body.sockets.includes(key))) continue;
    if (def.childSockets.includes(socket) !== target.childSockets.includes(key)) continue;
    const c = cfToMatrix4(candidate.frame),
      score =
        p.distanceToSquared(new Vector3().setFromMatrixPosition(c)) +
        n.distanceToSquared(new Vector3().setFromMatrixColumn(c, 1));
    if (score < error) {
      error = score;
      best = key;
    }
  }
  return error < 0.0025 ? best : socket;
}
