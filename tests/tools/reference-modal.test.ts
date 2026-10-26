// @vitest-environment jsdom
import { Quaternion, Euler } from 'three';
import { clearSelection } from '../../src/state/selection';
import { docSig, historySig, resetStoreForTests } from '../../src/state/store';
import { settingsSig, DEFAULT_SETTINGS, updateSettings } from '../../src/state/settings';
import { inspectorTabSig } from '../../src/state/ui';
import {
  addReferenceUrl,
  activeReferenceSig,
  clearReferences,
  insertReferencePlane,
  referencePlanesSig,
} from '../../src/state/references';
import { cancelModal, modalActiveSig, startModal, refreshModal } from '../../src/tools/modal';
import { setViewport } from '../../src/viewport/context';
import { fakeViewport } from '../helpers/viewport';

const press = (code: string, key: string) =>
  window.dispatchEvent(
    new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }),
  );
let id: number;
beforeEach(() => {
  resetStoreForTests();
  clearSelection();
  clearReferences();
  settingsSig.value = DEFAULT_SETTINGS;
  inspectorTabSig.value = 'reference';
  setViewport(fakeViewport());
  addReferenceUrl('https://example.com/a.png');
  id = activeReferenceSig.peek()!.id;
  insertReferencePlane(id, [1.1, 0.57, -1.03], [0, 0, 0]);
});
afterEach(() => {
  cancelModal();
  clearReferences();
  setViewport(null);
  inspectorTabSig.value = 'properties';
  settingsSig.value = DEFAULT_SETTINGS;
});

test('G starts a local modal, follows the mouse, and Esc restores the original transform', () => {
  const doc = docSig.peek(),
    history = historySig.peek();
  expect(startModal('move')).toBe(true);
  expect(modalActiveSig.value).toBe(true);
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 460, clientY: 300 }));
  expect(referencePlanesSig.peek().get(id)!.position).not.toEqual([1.1, 0.57, -1.03]);
  press('Escape', 'Escape');
  expect(referencePlanesSig.peek().get(id)!.position).toEqual([1.1, 0.57, -1.03]);
  expect(docSig.peek()).toBe(doc);
  expect(historySig.peek()).toBe(history);
});

test.each([false, true])(
  'Ctrl modal move uses relative steps or the absolute world grid (world=%s)',
  (grid) => {
    updateSettings({ snapToGrid: grid, snapMove: 0.25 });
    expect(startModal('move')).toBe(true);
    press('KeyX', 'x');
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 460, clientY: 300, ctrlKey: true }),
    );
    press('Enter', 'Enter');
    const p = referencePlanesSig.peek().get(id)!.position;
    if (grid) for (const v of p) expect(v / 0.25).toBeCloseTo(Math.round(v / 0.25), 8);
    else {
      expect((p[0] - 1.1) / 0.25).toBeCloseTo(Math.round((p[0] - 1.1) / 0.25), 8);
      expect(p.slice(1)).toEqual([0.57, -1.03]);
    }
  },
);

test('R accepts an axis and typed angle, confirms, and cancellation preserves that confirmed angle', () => {
  expect(startModal('rotate')).toBe(true);
  press('KeyZ', 'z');
  press('Digit9', '9');
  press('Digit0', '0');
  press('Enter', 'Enter');
  const rotation = referencePlanesSig.peek().get(id)!.rotation;
  const q = new Quaternion().setFromEuler(
    new Euler(...(rotation.map((v) => (v * Math.PI) / 180) as [number, number, number])),
  );
  expect(Math.abs(q.dot(new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2))))).toBeCloseTo(
    1,
    8,
  );
  startModal('rotate');
  press('KeyX', 'x');
  press('Digit4', '4');
  press('Digit5', '5');
  press('Escape', 'Escape');
  expect(referencePlanesSig.peek().get(id)!.rotation).toEqual(rotation);
});

test('leaving Reference makes a modal target invalid and restores the starting position', () => {
  expect(startModal('move')).toBe(true);
  press('KeyX', 'x');
  press('Digit2', '2');
  inspectorTabSig.value = 'properties';
  refreshModal();
  expect(modalActiveSig.value).toBe(false);
  expect(referencePlanesSig.peek().get(id)!.position).toEqual([1.1, 0.57, -1.03]);
});
