// @vitest-environment jsdom
import { socketStyle, SocketsLayer } from '../../src/viewport/sockets-layer';
import { Matrix4, Vector2, Vector3, type InstancedMesh, type ShaderMaterial } from 'three';
import { fakeViewport } from '../helpers/viewport';
import { setViewport } from '../../src/viewport/context';
import { pickSocketWhere } from '../../src/viewport/raycast';
import {
  shiftSocketSig,
  socketFocusSig,
  socketCursorSig,
  socketMagnification,
} from '../../src/state/socket-focus';
import {
  settingsSig,
  updateSettings,
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from '../../src/state/settings';
import { realCatalog } from '../helpers/real-catalog';
import { CameraRig } from '../../src/viewport/cameras/rig';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { computePoses } from '../../src/core/pose';
afterEach(() => {
  setViewport(null);
  shiftSocketSig.value = false;
  socketFocusSig.value = null;
  socketCursorSig.value = null;
  settingsSig.value = DEFAULT_SETTINGS;
});
test('the actual socket pick radius expands with Shift to match the enlarged marker', () => {
  const vp = fakeViewport({
    sockets: {
      shown: () => [{ part: 1, socket: '6', world: new Vector3(), side: 'parent' }],
    } as never,
  });
  Object.defineProperty(vp.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(vp.canvas, 'clientHeight', { value: 600 });
  setViewport(vp);
  const center = new Vector3().project(vp.rig.camera),
    ndc = new Vector2(center.x + (18 * 2) / 800, center.y);
  socketFocusSig.value = () => true;
  expect(pickSocketWhere(ndc, () => true, 12)).toBeNull();
  shiftSocketSig.value = true;
  expect(pickSocketWhere(ndc, () => true, 12)).toEqual({ part: 1, socket: '6' });
});

test('sockets inside the near clipping plane cannot be picked', () => {
  const vp = fakeViewport();
  Object.defineProperty(vp.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(vp.canvas, 'clientHeight', { value: 600 });
  const world = vp.rig.camera.position
    .clone()
    .addScaledVector(vp.rig.camera.getWorldDirection(new Vector3()), 0.025);
  setViewport({
    ...vp,
    sockets: { shown: () => [{ part: 1, socket: '6', world, side: 'parent' }] } as never,
  });
  socketFocusSig.value = () => true;
  shiftSocketSig.value = true;
  expect(pickSocketWhere(new Vector2(), () => true, 12)).toBeNull();
});
test('mechanical mount sockets retain distinct orange/red styles', async () => {
  const c = await realCatalog();
  expect(socketStyle(c.parts.Bearing.sockets['2']).fill).toBe(0xff922b);
  expect(socketStyle(c.parts.Servo_Physics.sockets['2']).fill).toBe(0xff922b);
  expect(socketStyle(c.parts.Chassis.sockets['3']).fill).toBe(0xef5a4c);
  expect(socketStyle(c.parts.Part.sockets['6']).fill).toBe(0x7cc4fa);
});
test('Shift enlargement is configurable, limited to compatible sockets and absent outside carrying/dragging', () => {
  shiftSocketSig.value = true;
  expect(socketMagnification({ part: 1, socket: '6' }, 0)).toBe(1);
  socketFocusSig.value = (s) => s.socket === '6';
  expect(socketMagnification({ part: 1, socket: '6' }, 0)).toBe(2);
  expect(socketMagnification({ part: 1, socket: '1' }, 0)).toBe(1);
  updateSettings({ shiftSocketEnlargement: 150 });
  expect(socketMagnification({ part: 1, socket: '6' }, 0)).toBe(2.5);
  shiftSocketSig.value = false;
  expect(socketMagnification({ part: 1, socket: '6' }, 0)).toBe(1);
});

test('enlargement falls off smoothly in a configurable pixel radius', () => {
  shiftSocketSig.value = true;
  socketFocusSig.value = () => true;
  updateSettings({ shiftSocketRadius: 200 });
  const s = { part: 1, socket: '6' };
  expect(socketMagnification(s, 0)).toBe(2);
  expect(socketMagnification(s, 100)).toBe(1.5);
  expect(socketMagnification(s, 199)).toBeCloseTo(1, 3);
  expect(socketMagnification(s, 200)).toBe(1);
  expect(socketMagnification(s, 300)).toBe(1);
  expect(socketMagnification(s)).toBe(1);
  expect(socketMagnification({ ...s, side: 'child' }, 0)).toBe(1);
  expect(sanitizeSettings({ shiftSocketRadius: 0 }).shiftSocketRadius).toBe(150);
  expect(sanitizeSettings({ shiftSocketRadius: 1001 }).shiftSocketRadius).toBe(150);
});

test('only near compatible sockets move to the depth-free pass and release restores them', () => {
  const rig = new CameraRig();
  rig.setSize(800, 600);
  const doc = docOf(part(1, 'Part'));
  const poses = computePoses(doc, MINI, MINI.conventions);
  const layer = new SocketsLayer();
  const update = () => layer.update(doc, poses, MINI, [1], rig, 100);
  const counts = (onTop: boolean) =>
    (layer.group.children as InstancedMesh[])
      .filter((m) => (m.material as ShaderMaterial).depthTest !== onTop)
      .reduce((n, m) => n + m.count, 0) / 2;
  update();
  const near = layer.shown().find((s) => s.socket === '6')!;
  socketCursorSig.value = near.world.clone().project(rig.camera);
  socketFocusSig.value = (s) => s.socket === '6';
  shiftSocketSig.value = true;
  update();
  expect(counts(true)).toBe(1);
  expect(counts(false)).toBe(5);
  const mesh = (layer.group.children as InstancedMesh[]).find(
    (m) => !(m.material as ShaderMaterial).depthTest && m.count === 1,
  )!;
  const transform = new Matrix4();
  mesh.getMatrixAt(0, transform);
  const enlarged = new Vector3().setFromMatrixScale(transform).x;
  socketCursorSig.value = { x: 100, y: 100 };
  update();
  expect(counts(true)).toBe(0);
  expect(counts(false)).toBe(6);
  socketCursorSig.value = near.world.clone().project(rig.camera);
  shiftSocketSig.value = false;
  update();
  expect(counts(true)).toBe(0);
  const normal = (layer.group.children as InstancedMesh[]).find(
    (m) => (m.material as ShaderMaterial).depthTest && m.count === 6,
  )!;
  normal.getMatrixAt(
    layer.shown().findIndex((s) => s.socket === '6'),
    transform,
  );
  expect(enlarged / new Vector3().setFromMatrixScale(transform).x).toBeCloseTo(2, 5);
  layer.dispose();
});
