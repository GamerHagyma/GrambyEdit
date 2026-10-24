// @vitest-environment jsdom
import { StudioControls } from '../../src/viewport/cameras/studio';
import { settingsSig } from '../../src/state/settings';
import { fakeViewport } from '../helpers/viewport';

function navigation() {
  const vp = fakeViewport();
  vp.canvas.setPointerCapture = () => {};
  const controls = new StudioControls({
    rig: vp.rig,
    dom: vp.canvas,
    settings: () => settingsSig.value,
    request: vp.request,
    ndc: vp.ndc,
    pivotAt: () => null,
    frameSelection() {},
    frameAll() {},
  });
  const pointer = (kind: string, x: number) =>
    new PointerEvent(kind, {
      button: 2,
      buttons: kind === 'pointerup' ? 0 : 2,
      pointerId: 1,
      clientX: x,
      clientY: 100,
    });
  return { controls, canvas: vp.canvas, pointer };
}

test('a right drag remains a drag after returning to its starting point', () => {
  const { controls, canvas, pointer } = navigation();
  controls.onPointerDown(pointer('pointerdown', 100));
  canvas.dispatchEvent(pointer('pointermove', 140));
  canvas.dispatchEvent(pointer('pointermove', 100));
  canvas.dispatchEvent(pointer('pointerup', 100));
  expect(controls.rightDragged).toBe(true);
  controls.dispose();
});

test('a new plain right click is not confused with the preceding camera drag', () => {
  const { controls, canvas, pointer } = navigation();
  controls.onPointerDown(pointer('pointerdown', 100));
  canvas.dispatchEvent(pointer('pointermove', 140));
  canvas.dispatchEvent(pointer('pointerup', 140));
  controls.onPointerDown(pointer('pointerdown', 100));
  canvas.dispatchEvent(pointer('pointerup', 100));
  expect(controls.rightDragged).toBe(false);
  controls.dispose();
});
