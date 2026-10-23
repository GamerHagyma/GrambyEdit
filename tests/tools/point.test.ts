import { Matrix4, Vector3 } from 'three';
import { surfacePointFrame } from '../../src/tools/point';

test('a point on a surface: host-local position, normal snapped to a host axis within 10°', () => {
  const host = new Matrix4().makeTranslation(1, 0, 0);
  const normal = new Vector3(0.999, 0.03, 0).normalize();
  expect(surfacePointFrame(host, new Matrix4(), new Vector3(1.5, 0.2, 0.1), normal)).toEqual([
    0.5, 0.2, 0.1, 0, 1, 0, 0, 0, 1, 1, 0, 0,
  ]);
});

test('a normal more than 10° off every axis is kept, in the host turned 90° about Y', () => {
  const host = new Matrix4().makeRotationY(Math.PI / 2);
  const tilt = (20 * Math.PI) / 180;
  const worldNormal = new Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const cf = surfacePointFrame(host, new Matrix4(), new Vector3(0, 0.5, 0), worldNormal);
  // The local normal is the world normal turned back by the host: (-sin, cos, 0).
  const y = [cf[4], cf[7], cf[10]];
  expect(y.map((v) => +v.toFixed(6))).toEqual([+(-Math.sin(tilt)).toFixed(6), +Math.cos(tilt).toFixed(6), 0]);
});
