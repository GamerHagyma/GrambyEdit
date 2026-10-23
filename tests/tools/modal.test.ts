// @vitest-environment jsdom
import { select } from '../../src/state/selection';
import { baseCatalogSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { modalActiveSig, modalGuideSig, startModal } from '../../src/tools/modal';
import { setViewport } from '../../src/viewport/context';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';
import { fakeViewport } from '../helpers/viewport';

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
