// @vitest-environment jsdom
import { Vector2 } from 'three';
import { select } from '../../src/state/selection';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { modalActiveSig, modalGuideSig, startModal } from '../../src/tools/modal';
import { CameraRig } from '../../src/viewport/cameras/rig';
import { setViewport, type ViewportContext } from '../../src/viewport/context';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';

/** Just enough viewport for a modal transform: a camera, a sized canvas and pointer maths. */
function fakeViewport(): ViewportContext {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  document.body.append(host);
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  const rig = new CameraRig();
  rig.setSize(800, 600);
  return {
    rig,
    renderer: null as never,
    scene: null as never,
    canvas,
    layer: null,
    ghost: null,
    sockets: null,
    points: null,
    workbench: null,
    gizmo: null,
    onKey: () => false,
    snapshot: () => Promise.resolve(null),
    afterRender: new Set(),
    pointer: { x: 400, y: 300 },
    request() {},
    ndc: (e) => new Vector2((e.clientX / 800) * 2 - 1, -(e.clientY / 600) * 2 + 1),
  };
}

const press = (code: string, key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));

beforeEach(() => {
  resetStoreForTests();
  setViewport(fakeViewport());
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
});
afterEach(() => setViewport(null));

test('X shows the X axis through the pivot, then the local X axis, then nothing', () => {
  expect(startModal('move')).toBe(true);
  expect(modalActiveSig.value).toBe(true);
  expect(modalGuideSig.value).toBeNull();
  press('KeyX', 'x');
  expect(modalGuideSig.value?.axis).toBe('X');
  expect(modalGuideSig.value?.dir.toArray()).toEqual([1, 0, 0]);
  press('KeyX', 'x');
  expect(modalGuideSig.value?.axis).toBe('X');
  press('KeyX', 'x');
  expect(modalGuideSig.value).toBeNull();
  press('Escape', 'Escape');
});

test('ending the modal clears the guide and shows the gizmo again', () => {
  startModal('rotate');
  press('KeyZ', 'z');
  expect(modalGuideSig.value?.axis).toBe('Z');
  press('Escape', 'Escape');
  expect(modalGuideSig.value).toBeNull();
  expect(modalActiveSig.value).toBe(false);
});
