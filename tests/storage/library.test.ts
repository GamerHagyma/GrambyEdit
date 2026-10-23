import 'fake-indexeddb/auto';
import {
  deleteCreation,
  duplicateCreation,
  getCreation,
  listCreations,
  renameCreation,
  saveCreation,
  sha256Hex,
} from '../../src/storage/library';

// The database persists across tests in this file, so start each one empty.
beforeEach(async () => {
  for (const r of await listCreations()) await deleteCreation(r.id);
});

test('save, list, rename, duplicate, delete', async () => {
  const a = await saveCreation({
    name: 'Car',
    code: 'W1tdXQ==',
    partCount: 0,
    thumb: null,
    editorMeta: { rootLayout: {} },
  });
  expect(a.hash).toBe(await sha256Hex('W1tdXQ=='));
  await renameCreation(a.id, 'Kart');
  const b = await duplicateCreation(a.id);
  expect(b.name).toBe('Kart (copy)');
  expect((await listCreations()).map((r) => r.name)).toEqual(['Kart (copy)', 'Kart']);
  await deleteCreation(a.id);
  expect(await getCreation(a.id)).toBeUndefined();
});

test('sha256Hex is lowercase hex SHA-256', async () => {
  expect(await sha256Hex('abc')).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
