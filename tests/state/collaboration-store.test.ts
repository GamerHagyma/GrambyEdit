// @vitest-environment jsdom
import {
  commit,
  docSig,
  loadDoc,
  resetStoreForTests,
  setStoreAdapter,
  installSharedDoc,
  undo,
} from '../../src/state/store';
import { docOf, part } from '../helpers/doc';
beforeEach(resetStoreForTests);
afterEach(() => setStoreAdapter(null));
test('collaboration gates every document edit/replacement and remote installation never echoes', () => {
  loadDoc(docOf(part(1, 'Part')));
  const changed = vi.fn(),
    adapter = {
      canEdit: () => false,
      canReplace: () => false,
      allocate: () => 1000000,
      changed,
      undo: vi.fn(() => true),
    };
  setStoreAdapter(adapter);
  const original = docSig.value;
  expect(commit('blocked', (d) => d.delete(1))).toBeNull();
  expect(loadDoc(docOf())).toBe(false);
  expect(docSig.value).toBe(original);
  installSharedDoc(docOf(part(2, 'Part')), true);
  expect(docSig.value.order).toEqual([2]);
  expect(changed).not.toHaveBeenCalled();
  expect(undo()).toBe(false);
  adapter.canEdit = () => true;
  expect(undo()).toBe(true);
  expect(adapter.undo).toHaveBeenCalledWith(false);
});
test('local transactions use leased IDs and notify once after a successful edit', () => {
  const changed = vi.fn();
  setStoreAdapter({
    canEdit: () => true,
    canReplace: () => false,
    allocate: () => 1000000,
    changed,
    undo: () => false,
  });
  commit('Add', (d) => {
    const id = d.allocId();
    d.add(part(id, 'Part'));
  });
  expect(docSig.value.order).toEqual([1000000]);
  expect(changed).toHaveBeenCalledTimes(1);
});
