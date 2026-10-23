// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { toShareCode } from '../../../src/core/share';
import type { CFrame12 } from '../../../src/core/types';
import { ImportDialog } from '../../../src/ui/dialogs/ImportDialog';
import { LibraryDialog } from '../../../src/ui/dialogs/LibraryDialog';
import { RestorePrompt } from '../../../src/ui/dialogs/RestorePrompt';
import { SaveDialog } from '../../../src/ui/dialogs/SaveDialog';
import { Toasts } from '../../../src/ui/layout/Toasts';
import { PartBrowser } from '../../../src/ui/panels/PartBrowser';
import { PartPicker } from '../../../src/ui/widgets/PartPicker';
import { creationsSig, openCreationIdSig, refreshCreations } from '../../../src/state/library';
import { placeSig } from '../../../src/state/place';
import {
  baseCatalogSig,
  commit,
  docSig,
  loadDoc,
  resetStoreForTests,
} from '../../../src/state/store';
import { toastsSig } from '../../../src/state/toasts';
import { clearAutosave, readAutosave, writeAutosave } from '../../../src/storage/autosave';
import { deleteCreation, listCreations, saveCreation } from '../../../src/storage/library';
import { MINI } from '../../helpers/catalog';
import { chainDoc, docOf, part } from '../../helpers/doc';
import { APPENDIX_A_CODE } from '../../fixtures/spec-codes';

const AT7: CFrame12 = [7, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

/** A creation whose code is an `n`-part chain. */
function saveNamed(name: string, n = 2, extra: { tags?: string[]; notes?: string } = {}) {
  return saveCreation({
    name,
    code: toShareCode(chainDoc(n)),
    partCount: n,
    thumb: null,
    editorMeta: { rootLayout: {} },
    ...extra,
  });
}

beforeEach(async () => {
  resetStoreForTests();
  placeSig.value = null;
  openCreationIdSig.value = null;
  toastsSig.value = [];
  // IndexedDB persists across the tests of this file, so each test starts from an empty library.
  for (const r of await listCreations()) await deleteCreation(r.id);
  await clearAutosave();
  await refreshCreations();
});

test('cards show the share of the code limit; delete can be undone', async () => {
  await saveCreation({
    name: 'Car',
    code: 'A'.repeat(640_800),
    partCount: 3,
    thumb: null,
    editorMeta: { rootLayout: {} },
  });
  await refreshCreations();
  render(
    <>
      <LibraryDialog open onClose={() => {}} />
      <Toasts />
    </>,
  );
  expect(await screen.findByText('8.01% of code limit')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Delete Car'));
  fireEvent.click(await screen.findByText('Undo'));
  await waitFor(async () => expect((await listCreations()).map((r) => r.name)).toEqual(['Car']));
});

test('My creations appear in the picker and arm a prefab', async () => {
  baseCatalogSig.value = MINI;
  const rec = await saveCreation({
    name: 'Wheelset',
    code: 'W1tdXQ==',
    partCount: 0,
    thumb: null,
    editorMeta: { rootLayout: {} },
  });
  await refreshCreations();
  const onPick = vi.fn();
  render(
    <PartPicker
      eligible={() => true}
      onPick={onPick}
      onClose={() => {}}
      anchor={{ x: 0, y: 0 }}
      creations={creationsSig.value}
    />,
  );
  fireEvent.click(screen.getByText('Wheelset'));
  expect(onPick).toHaveBeenCalledWith({ kind: 'creation', id: rec.id });
});

test('My creations in the part browser arm the creation', async () => {
  baseCatalogSig.value = MINI;
  const rec = await saveNamed('Wheelset');
  await refreshCreations();
  const onArm = vi.fn();
  render(<PartBrowser onArm={onArm} creations={creationsSig.value} />);
  fireEvent.click(screen.getByText('Wheelset'));
  expect(onArm).toHaveBeenCalledWith({ kind: 'creation', id: rec.id });
});

test('opening asks before replacing a build with history', async () => {
  await saveNamed('Five', 5);
  await refreshCreations();
  loadDoc(chainDoc(2));
  commit('add', (d) => {
    const id = d.allocId();
    d.add({ id, type: 'Part', conns: [], props: {}, points: null });
  });
  const onClose = vi.fn();
  render(<LibraryDialog open onClose={onClose} />);
  fireEvent.click(screen.getByText('Open'));
  expect(screen.getByText('Replace the current build? Unsaved changes are lost.')).toBeTruthy();
  expect(docSig.value.order).toHaveLength(3);
  fireEvent.click(screen.getByText('Replace'));
  await waitFor(() => expect(docSig.value.order).toHaveLength(5));
  expect(onClose).toHaveBeenCalled();
});

test('Insert as part arms the creation and closes the library', async () => {
  const rec = await saveNamed('Wheelset');
  await refreshCreations();
  const onClose = vi.fn();
  render(<LibraryDialog open onClose={onClose} />);
  fireEvent.click(screen.getByText('Insert as part'));
  expect(placeSig.value).toEqual({ kind: 'creation', id: rec.id });
  expect(onClose).toHaveBeenCalled();
});

test('search matches names and tags, and sorting reorders the cards', async () => {
  await saveNamed('Alpha', 2, { tags: ['wheels'] });
  await saveNamed('Beta', 4, { tags: ['engine'] });
  await refreshCreations();
  render(<LibraryDialog open onClose={() => {}} />);
  const names = () => [...document.querySelectorAll('.creation-name')].map((e) => e.textContent);
  expect(names()).toEqual(['Beta', 'Alpha']);
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name' } });
  expect(names()).toEqual(['Alpha', 'Beta']);
  fireEvent.input(screen.getByLabelText('Search creations'), { target: { value: 'engine' } });
  expect(names()).toEqual(['Beta']);
});

test('rename edits the name inline', async () => {
  await saveNamed('Car');
  await refreshCreations();
  render(<LibraryDialog open onClose={() => {}} />);
  fireEvent.click(screen.getByLabelText('Rename Car'));
  fireEvent.input(screen.getByLabelText('New name'), { target: { value: 'Truck' } });
  fireEvent.keyDown(screen.getByLabelText('New name'), { key: 'Enter' });
  await waitFor(async () => expect((await listCreations()).map((r) => r.name)).toEqual(['Truck']));
});

test('saving over the open creation keeps its id, tags and notes', async () => {
  const rec = await saveNamed('Car', 2, { tags: ['wheels'], notes: 'v2' });
  await refreshCreations();
  openCreationIdSig.value = rec.id;
  loadDoc(chainDoc(3));
  const onClose = vi.fn();
  render(<SaveDialog open onClose={onClose} />);
  await screen.findByDisplayValue('Car');
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  const all = await listCreations();
  expect(all).toHaveLength(1);
  expect(all[0]).toMatchObject({
    id: rec.id,
    name: 'Car',
    tags: ['wheels'],
    notes: 'v2',
    partCount: 3,
  });
});

test('Save as new is offered only with an open creation, and adds a record', async () => {
  const onClose = vi.fn();
  const { unmount } = render(<SaveDialog open onClose={onClose} />);
  expect(screen.queryByText('Save as new')).toBeNull();
  unmount();

  const rec = await saveNamed('Car');
  await refreshCreations();
  openCreationIdSig.value = rec.id;
  render(<SaveDialog open onClose={onClose} />);
  await screen.findByDisplayValue('Car');
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Car copy' } });
  fireEvent.click(screen.getByText('Save as new'));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect((await listCreations()).map((r) => r.name).sort()).toEqual(['Car', 'Car copy']);
});

test('a selection save with nothing selected says why and stays open', async () => {
  const onClose = vi.fn();
  render(<SaveDialog open selectionOnly onClose={onClose} />);
  fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Pair' } });
  fireEvent.click(screen.getByText('Save'));
  await waitFor(() =>
    expect(toastsSig.value.map((t) => t.message)).toContain('Select the parts to save first.'),
  );
  expect(onClose).not.toHaveBeenCalled();
});

test('restore reopens the unsaved build with its root layout', async () => {
  const savedAt = Date.now();
  await writeAutosave({
    code: toShareCode(docOf(part(1, 'Part'), part(2, 'Part'))),
    editorMeta: { rootLayout: { 1: AT7 } },
    savedAt,
    creationId: null,
  });
  render(<RestorePrompt />);
  expect(
    await screen.findByText(`Restore unsaved work from ${new Date(savedAt).toLocaleString()}?`),
  ).toBeTruthy();
  fireEvent.click(screen.getByText('Restore'));
  await waitFor(() => expect(docSig.value.order).toHaveLength(2));
  expect(docSig.value.layout.get(2)).toEqual(AT7);
  expect(screen.queryByText('Restore')).toBeNull();
});

test('discard deletes the unsaved work', async () => {
  await writeAutosave({
    code: toShareCode(chainDoc(1)),
    editorMeta: { rootLayout: {} },
    savedAt: Date.now(),
    creationId: null,
  });
  render(<RestorePrompt />);
  fireEvent.click(await screen.findByText('Discard'));
  await waitFor(async () => expect(await readAutosave()).toBeUndefined());
  expect(screen.queryByText('Discard')).toBeNull();
});

test('import: Insert into current build arms the code as a paste and closes', () => {
  const onClose = vi.fn();
  render(<ImportDialog open onClose={onClose} />);
  fireEvent.input(screen.getByRole('textbox'), { target: { value: 'not a share code' } });
  expect((screen.getByText('Insert into current build') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.input(screen.getByRole('textbox'), { target: { value: APPENDIX_A_CODE } });
  fireEvent.click(screen.getByText('Insert into current build'));
  expect(placeSig.value).toMatchObject({ kind: 'paste' });
  expect(onClose).toHaveBeenCalled();
});
