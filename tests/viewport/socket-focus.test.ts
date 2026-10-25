// @vitest-environment jsdom
import { socketStyle } from '../../src/viewport/sockets-layer';
import { Vector2, Vector3 } from 'three';
import { fakeViewport } from '../helpers/viewport';
import { setViewport } from '../../src/viewport/context';
import { pickSocketWhere } from '../../src/viewport/raycast';
import { shiftSocketSig, socketFocusSig, socketMagnification } from '../../src/state/socket-focus';
import { settingsSig, updateSettings, DEFAULT_SETTINGS } from '../../src/state/settings';
import { realCatalog } from '../helpers/real-catalog';
afterEach(() => {
  setViewport(null);
  shiftSocketSig.value = false;
  socketFocusSig.value = null;
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
test('mechanical mount sockets retain distinct orange/red styles', async () => {
  const c = await realCatalog();
  expect(socketStyle(c.parts.Bearing.sockets['2']).fill).toBe(0xff922b);
  expect(socketStyle(c.parts.Servo_Physics.sockets['2']).fill).toBe(0xff922b);
  expect(socketStyle(c.parts.Chassis.sockets['3']).fill).toBe(0xef5a4c);
  expect(socketStyle(c.parts.Part.sockets['6']).fill).toBe(0x7cc4fa);
});
test('Shift enlargement is configurable, limited to compatible sockets and absent outside carrying/dragging', () => {
  shiftSocketSig.value = true;
  expect(socketMagnification({ part: 1, socket: '6' })).toBe(1);
  socketFocusSig.value = (s) => s.socket === '6';
  expect(socketMagnification({ part: 1, socket: '6' })).toBe(2);
  expect(socketMagnification({ part: 1, socket: '1' })).toBe(1);
  updateSettings({ shiftSocketEnlargement: 150 });
  expect(socketMagnification({ part: 1, socket: '6' })).toBe(2.5);
  shiftSocketSig.value = false;
  expect(socketMagnification({ part: 1, socket: '6' })).toBe(1);
});
