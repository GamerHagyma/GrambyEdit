import { Vector2, Vector3 } from 'three';
import { CameraRig } from '../../src/viewport/cameras/rig';

const close = (a: Vector3, b: Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-9);

test('orbit keeps the target and the distance', () => {
  const rig = new CameraRig();
  rig.orbit(0.7, -0.2);
  expect(rig.persp.position.distanceTo(rig.target)).toBeCloseTo(rig.distance, 9);
  close(rig.target, new Vector3());
});
test('look turns the view in place', () => {
  const rig = new CameraRig();
  const eye = rig.persp.position.clone();
  rig.look(0.4, 0.1);
  close(rig.persp.position, eye);
  expect(rig.target.equals(new Vector3())).toBe(false);
});
test('zooming keeps the point under the cursor fixed on screen', () => {
  const rig = new CameraRig();
  rig.setSize(800, 600);
  const cursor = new Vector2(0.4, -0.3);
  const p = rig.pointAtTargetDepth(cursor);
  rig.zoomAt(0.5, cursor);
  const v = p.clone().project(rig.persp);
  expect(v.x).toBeCloseTo(cursor.x, 9);
  expect(v.y).toBeCloseTo(cursor.y, 9);
});
test('views look down their axis: front from +Z, top from +Y', () => {
  const rig = new CameraRig();
  rig.setView('front');
  const back = rig.persp.position.clone().sub(rig.target).normalize();
  close(back, new Vector3(0, 0, 1));
  rig.setView('top');
  expect(rig.persp.position.y - rig.target.y).toBeCloseTo(rig.distance, 3);
});
test('framing fits the sphere in the vertical field of view', () => {
  const rig = new CameraRig();
  rig.frame(new Vector3(5, 1, 0), 2);
  close(rig.target, new Vector3(5, 1, 0));
  expect(rig.distance * Math.sin(((rig.persp.fov / 2) * Math.PI) / 180)).toBeGreaterThan(2);
});
