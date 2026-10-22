import {
  docSig,
  commit,
  undo,
  redo,
  loadDoc,
  resetStoreForTests,
  viewBus,
} from '../../src/state/store';
import { selectionSig, select, selectModeSig } from '../../src/state/selection';
import { chainDoc } from '../helpers/doc';

beforeEach(resetStoreForTests);

test('commit, undo, redo through the store; undo sanitises the selection', () => {
  loadDoc(chainDoc(2));
  commit('add', (d) => {
    const id = d.allocId();
    d.add({ id, type: 'Part', conns: [], props: {}, points: null });
  });
  select([3], 'replace');
  expect(undo()).toBe(true);
  expect(docSig.value.order).toEqual([1, 2]);
  expect(selectionSig.value.parts.size).toBe(0);
  expect(redo()).toBe(true);
  expect(docSig.value.order).toEqual([1, 2, 3]);
});
test('attached mode expands picks to pose descendants', () => {
  loadDoc(chainDoc(4));
  selectModeSig.value = 'attached';
  select([2], 'replace');
  expect([...selectionSig.value.parts].sort()).toEqual([2, 3, 4]);
});
test('select ops and the active part', () => {
  loadDoc(chainDoc(4));
  select([1, 2], 'replace');
  select([2, 3], 'toggle');
  expect([...selectionSig.value.parts].sort()).toEqual([1, 3]);
  expect(selectionSig.value.active).toBe(3);
  select([1], 'remove');
  expect([...selectionSig.value.parts]).toEqual([3]);
  select([], 'replace');
  expect(selectionSig.value).toMatchObject({ active: null });
  expect(selectionSig.value.parts.size).toBe(0);
});
test('a no-op commit records nothing; the view bus delivers and unsubscribes', () => {
  loadDoc(chainDoc(1));
  expect(commit('noop', () => {})).toBeNull();
  expect(undo()).toBe(false);
  const seen: string[] = [];
  const off = viewBus.on((e) => seen.push(e.kind));
  viewBus.emit({ kind: 'frame-all' });
  off();
  viewBus.emit({ kind: 'frame-all' });
  expect(seen).toEqual(['frame-all']);
});
