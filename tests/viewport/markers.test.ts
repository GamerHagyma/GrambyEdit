import type { InstancedMesh } from 'three';
import { DEFAULT_CONVENTIONS as C } from '../../src/core/conventions';
import { computePoses, poseTargets } from '../../src/core/pose';
import { CameraRig } from '../../src/viewport/cameras/rig';
import { PointsLayer } from '../../src/viewport/points-layer';
import { SocketsLayer } from '../../src/viewport/sockets-layer';
import { MINI } from '../helpers/catalog';
import { chainDoc, docOf, mount, part, pt, sock } from '../helpers/doc';

const rig = () => {
  const r = new CameraRig();
  r.setSize(800, 600);
  return r;
};
/** Instanced meshes in a layer's group and how many markers they draw in all (outline + fill passes). */
const drawn = (meshes: readonly unknown[]) => {
  const instanced = (meshes as InstancedMesh[]).filter((m) => m.isInstancedMesh);
  return { meshes: instanced.length, markers: instanced.reduce((n, m) => n + m.count, 0) / 2 };
};

test('growing past capacity replaces the socket meshes instead of leaving stale ones drawn', () => {
  // 30 cubes × 6 sockets = 180 markers, past the first capacity of 64.
  const doc = chainDoc(30);
  const poses = computePoses(doc, MINI, C);
  const layer = new SocketsLayer();
  // Two passes each for the normal and the on-top (attach) markers.
  layer.update(doc, poses, MINI, [1], rig(), 1000);
  expect(drawn(layer.group.children)).toEqual({ meshes: 4, markers: 6 });
  layer.update(doc, poses, MINI, doc.order, rig(), 1000);
  expect(layer.shown()).toHaveLength(180);
  expect(drawn(layer.group.children)).toEqual({ meshes: 4, markers: 180 });
  layer.update(doc, poses, MINI, [], rig(), 1000);
  expect(drawn(layer.group.children)).toEqual({ meshes: 4, markers: 0 });
});

test('growing past capacity replaces the point meshes too', () => {
  const points = Array.from({ length: 70 }, (_, i) => pt(`{p${i}}`, undefined, 'Base'));
  const doc = docOf(part(1, 'Base', [], {}, points));
  const poses = computePoses(doc, MINI, C);
  const layer = new PointsLayer();
  layer.update(doc, poses, MINI, [1], rig(), 1000, new Set(), false);
  expect(layer.shown()).toHaveLength(70);
  layer.update(doc, poses, MINI, [], rig(), 1000, new Set(), false);
  expect(drawn(layer.group.children)).toEqual({ meshes: 4, markers: 0 });
});

test("a selected part's pose target is drawn even when its parent is not shown", () => {
  const doc = docOf(
    part(1, 'Base', [], {}, [pt('{a}', undefined, 'Base')]),
    part(2, 'Part', [mount('1', 1, '{a}')]),
    part(3, 'Part', [sock('1', 2, '6')]),
  );
  const poses = computePoses(doc, MINI, C);
  const t = poseTargets(doc, MINI, [2, 3]);
  expect([...t.sockets]).toEqual(['2:6']);
  expect([...t.points]).toEqual(['1:{a}']);
  const sockets = new SocketsLayer();
  sockets.update(doc, poses, MINI, [], rig(), 1000, t.sockets);
  expect(sockets.shown().map((s) => `${s.part}:${s.socket}`)).toEqual(['2:6']);
  const points = new PointsLayer();
  points.update(doc, poses, MINI, [], rig(), 1000, new Set(), true, t.points);
  expect(points.shown().map((p) => `${p.host}:${p.uuid}`)).toEqual(['1:{a}']);
});
