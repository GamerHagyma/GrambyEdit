import { Matrix4, Vector3, Quaternion } from 'three';
import type { Conventions } from '../../src/core/catalog-types';
import {
  childWorldViaPoint,
  childWorldViaSocket,
  orientationFromRotation,
  orientationMatrix,
  pointFrameFor,
  DEFAULT_CONVENTIONS as C,
} from '../../src/core/conventions';
import { cfToMatrix4 } from '../../src/core/cframe';

const rnd = (s: number) =>
  new Matrix4().compose(
    new Vector3(s, 2 * s, -s),
    new Quaternion().setFromAxisAngle(new Vector3(1, s, 0.5).normalize(), s),
    new Vector3(1, 1, 1),
  );

const SOCKET_PIVOT: Conventions = { ...C, orientationPivot: 'socket' };
const same = (a: Matrix4, b: Matrix4, digits = 9) =>
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], digits));
const origin = (m: Matrix4) => new Vector3().setFromMatrixPosition(m);

test.each([
  ['part', C],
  ['socket', SOCKET_PIVOT],
])('pointFrameFor inverts childWorldViaPoint (%s pivot)', (_, conv) => {
  const host = rnd(0.3),
    sub = rnd(0.1),
    child = rnd(0.7),
    sock = rnd(0.2);
  const props = { OrientationX: 90, OrientationZ: 45 };
  const cf = pointFrameFor(host, sub, child, sock, props, conv);
  const back = childWorldViaPoint(host, sub, cfToMatrix4(cf), sock, props, conv);
  same(back, child);
});

test('Orientation turns a part about its own origin, as the in-game rotate tool does', () => {
  // The child socket sits off the child's origin; the parent socket is at the world origin, +Y up.
  const childSocket = new Matrix4().makeRotationX(Math.PI).setPosition(0, -0.5, 0.3);
  const plain = childWorldViaSocket(new Matrix4(), new Matrix4(), childSocket, {}, C);
  const turned = childWorldViaSocket(
    new Matrix4(),
    new Matrix4(),
    childSocket,
    { OrientationX: 90 },
    C,
  );
  expect(origin(turned).distanceTo(origin(plain))).toBeLessThan(1e-12);
  same(turned, plain.clone().multiply(new Matrix4().makeRotationX(-Math.PI / 2)));
  // The older socket pivot keeps the child's socket on the parent's instead.
  const bySocket = childWorldViaSocket(
    new Matrix4(),
    new Matrix4(),
    childSocket,
    { OrientationX: 90 },
    SOCKET_PIVOT,
  );
  expect(origin(bySocket.clone().multiply(childSocket)).length()).toBeLessThan(1e-12);
});

test('orientationFromRotation recovers angles that orientationMatrix turns into a rotation', () => {
  for (const [x, y, z] of [
    [90, 0, 0],
    [22.5, 45, -67.5],
    [0, 135, 10],
    [1080, 45, 0],
  ]) {
    const m = orientationMatrix({ OrientationX: x, OrientationY: y, OrientationZ: z }, C);
    const back = orientationFromRotation(m, C);
    for (const v of [back.x, back.y, back.z]) expect(Number.isFinite(v)).toBe(true);
    const again = { OrientationX: back.x, OrientationY: back.y, OrientationZ: back.z };
    same(orientationMatrix(again, C), m, 6);
  }
});
test('a positive OrientationY turns a part clockwise seen from above, as in game', () => {
  // The user's Part test (tests/core/in-game.test.ts): Y = 90 in game is -90 by the right-hand rule.
  same(orientationMatrix({ OrientationY: 90 }, C), new Matrix4().makeRotationY(-Math.PI / 2), 12);
  expect(orientationFromRotation(new Matrix4().makeRotationY(-Math.PI / 2), C).y).toBe(90);
});
test('a positive OrientationX turns a part against the right-hand rule, as in game', () => {
  // The user's Cadillac (tests/core/in-game.test.ts): X = 90 turns a part's +Y to -Z and its +Z to +Y.
  const want = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  same(orientationMatrix({ OrientationX: 90 }, C), want, 12);
  expect(orientationFromRotation(want, C).x).toBe(90);
});
test("Orientation turns a part by the inverse of Roblox's CFrame.fromOrientation, as in game", () => {
  // fromOrientation(x, y, z) = Ry(y)·Rx(x)·Rz(z). X, Y and Z all turn against the right-hand rule and Z
  // goes on before X: only so do the Cadillac's grille rods (X 90 with Z 270 and Z 90) lie in their slot
  // (tests/core/in-game.test.ts). X before Y follows from the inverse; probe P7 checks it.
  const DEG = Math.PI / 180;
  for (const [x, y, z] of [
    [90, 0, 270],
    [30, 180, 0],
    [22.5, 45, -67.5],
  ]) {
    const roblox = new Matrix4()
      .makeRotationY(y * DEG)
      .multiply(new Matrix4().makeRotationX(x * DEG))
      .multiply(new Matrix4().makeRotationZ(z * DEG));
    const props = { OrientationX: x, OrientationY: y, OrientationZ: z };
    same(orientationMatrix(props, C), roblox.invert(), 12);
  }
});
test('orientation is degrees, and missing or non-numeric keys count as 0', () => {
  const m = orientationMatrix({ OrientationX: 90, OrientationY: 'x', Other: 5 }, C);
  const want = new Matrix4().makeRotationX(-Math.PI / 2);
  m.elements.forEach((v, i) => expect(v).toBeCloseTo(want.elements[i], 12));
  expect(orientationMatrix({}, C).equals(new Matrix4())).toBe(true);
});
test('a point mount without orientation on points ignores the child orientation', () => {
  const host = rnd(0.3),
    sub = rnd(0.1),
    point = rnd(0.5),
    sock = rnd(0.2);
  const off = { ...C, orientationOnPoints: false };
  const a = childWorldViaPoint(host, sub, point, sock, { OrientationY: 90 }, off);
  const b = childWorldViaPoint(host, sub, point, sock, {}, off);
  a.elements.forEach((v, i) => expect(v).toBeCloseTo(b.elements[i], 12));
  const j = childWorldViaSocket(host, point, sock, {}, C);
  const k = childWorldViaPoint(host, new Matrix4(), point, sock, {}, C);
  j.elements.forEach((v, i) => expect(v).toBeCloseTo(k.elements[i], 12));
});
