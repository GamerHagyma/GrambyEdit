// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { toShareCode } from '../../src/core/share';
import { EMPTY_DOC } from '../../src/core/types';
import {
  creationsSig,
  editorMetaOf,
  openCreation,
  persistentSig,
  refreshCreations,
  saveCurrent,
  saveSelectionAsCreation,
  startAutosave,
} from '../../src/state/library';
import { select } from '../../src/state/selection';
import { baseCatalogSig, commit, docSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { readAutosave } from '../../src/storage/autosave';
import { MINI } from '../helpers/catalog';
import { chainDoc, docOf, part, sock } from '../helpers/doc';

const AT7: [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] = [7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

beforeEach(resetStoreForTests);
// IndexedDB (fake-indexeddb) runs on setImmediate, so only setTimeout is ever faked here.
afterEach(() => vi.useRealTimers());

test('save and reopen keep the code and the root layout', async () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part')));
  commit('lay', (d) => d.setLayout(2, AT7));
  const rec = await saveCurrent('Two cubes');
  expect(rec.code).toBe(toShareCode(docSig.value));
  expect(rec.editorMeta.rootLayout[1]).toEqual(AT7);
  loadDoc(EMPTY_DOC);
  await openCreation(rec.id);
  expect(docSig.value.layout.get(2)).toEqual(AT7);
});

test('autosave writes once, 2 s after the last commit', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const stop = startAutosave();
  loadDoc(chainDoc(1));
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  commit('b', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 2 } }));
  await vi.advanceTimersByTimeAsync(1999);
  expect(await readAutosave()).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect((await readAutosave())!.code).toBe(toShareCode(docSig.value));
  stop();
});

test('the root layout is keyed by 0-based entry index', () => {
  const doc = { ...docOf(part(1, 'Part'), part(2, 'Part')), layout: new Map([[2, AT7]]) };
  expect(editorMetaOf(doc).rootLayout).toEqual({ 1: AT7 });
});

test('the first save asks for persistent storage and records the answer', async () => {
  persistentSig.value = null; // a new session: nothing asked yet
  const persist = vi.fn().mockResolvedValue(true);
  Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true });
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  await saveCurrent('One');
  await saveCurrent('Two');
  expect(persist).toHaveBeenCalledTimes(1);
  expect(persistentSig.value).toBe(true);
});

test('a selection saves as its own creation, joints kept', async () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part', [sock('1', 1, '6')]), part(3, 'Part')));
  select([1, 2], 'replace');
  const rec = await saveSelectionAsCreation('Pair');
  expect(rec.partCount).toBe(2);
  await refreshCreations();
  expect(creationsSig.value.some((r) => r.id === rec.id)).toBe(true);
});

test('opening a build is not unsaved work; saving clears the slot', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const stop = startAutosave();
  baseCatalogSig.value = MINI;
  loadDoc(chainDoc(2));
  await vi.advanceTimersByTimeAsync(2_500);
  expect(await readAutosave()).toBeUndefined();
  commit('a', (d) => d.set({ ...d.get(1)!, props: { OrientationY: 1 } }));
  await vi.advanceTimersByTimeAsync(2_000);
  expect(await readAutosave()).toBeDefined();
  await saveCurrent('Kept');
  expect(await readAutosave()).toBeUndefined();
  stop();
});
