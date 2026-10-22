import { Matrix4, Vector3, Quaternion } from 'three';
import {
  childWorldViaPoint,
  childWorldViaSocket,
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

test('pointFrameFor inverts childWorldViaPoint', () => {
  const host = rnd(0.3),
    sub = rnd(0.1),
    child = rnd(0.7),
    sock = rnd(0.2);
  const props = { OrientationX: 90, OrientationZ: 45 };
  const cf = pointFrameFor(host, sub, child, sock, props, C);
  const back = childWorldViaPoint(host, sub, cfToMatrix4(cf), sock, props, C);
  back.elements.forEach((v, i) => expect(v).toBeCloseTo(child.elements[i], 9));
});
test('orientation is degrees in XYZ order, and missing or non-numeric keys count as 0', () => {
  const m = orientationMatrix({ OrientationX: 90, OrientationY: 'x', Other: 5 }, C);
  const want = new Matrix4().makeRotationX(Math.PI / 2);
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
