// @vitest-environment jsdom
import { allCommands, runCommand } from '../../src/state/commands';
import { KEYMAPS } from '../../src/state/keymap';
import { hiddenSig, select, selectionSig } from '../../src/state/selection';
import { baseCatalogSig, docSig, loadDoc, resetStoreForTests } from '../../src/state/store';
import { MINI } from '../helpers/catalog';
import { docOf, part } from '../helpers/doc';

beforeEach(resetStoreForTests);

test('select.similarType and view.isolate', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Connector')));
  select([1], 'replace');
  runCommand('select.similarType');
  expect([...selectionSig.value.parts].sort()).toEqual([1, 2]);
  runCommand('view.isolate');
  expect([...hiddenSig.value]).toEqual([3]);
});

test('edit.delete commits one undoable step', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  select([1], 'replace');
  runCommand('edit.delete');
  expect(docSig.value.order).toEqual([]);
  runCommand('edit.undo');
  expect(docSig.value.order).toEqual([1]);
});

test('every keymap binding names a registered command', () => {
  const ids = new Set(allCommands().map((c) => c.id));
  for (const scheme of ['blender', 'studio'] as const) {
    expect(KEYMAPS[scheme].filter((b) => !ids.has(b.command))).toEqual([]);
  }
});

test('a disabled command does not run', () => {
  baseCatalogSig.value = MINI;
  loadDoc(docOf(part(1, 'Part')));
  expect(runCommand('edit.delete')).toBe(false);
  expect(docSig.value.order).toEqual([1]);
});

test('visibility toggle keeps selection, shows a mixed selection, then hides it together', () => {
  loadDoc(docOf(part(1, 'Part'), part(2, 'Part'), part(3, 'Part')));
  hiddenSig.value = new Set([1, 3]);
  select([1, 2], 'replace');
  expect(runCommand('view.toggleVisibility')).toBe(true);
  expect([...hiddenSig.value]).toEqual([3]);
  expect([...selectionSig.value.parts]).toEqual([1, 2]);
  runCommand('view.toggleVisibility');
  expect([...hiddenSig.value]).toEqual([3, 1, 2]);
  expect([...selectionSig.value.parts]).toEqual([1, 2]);
  runCommand('view.toggleVisibility');
  expect([...hiddenSig.value]).toEqual([3]);
});

test('visibility toggle is disabled with no selected parts', () => {
  loadDoc(docOf(part(1, 'Part')));
  hiddenSig.value = new Set([1]);
  expect(runCommand('view.toggleVisibility')).toBe(false);
  expect([...hiddenSig.value]).toEqual([1]);
});
