import 'fake-indexeddb/auto';
import { exportBundle, importBundle } from '../../src/storage/bundle';
import { deleteCreation, listCreations, saveCreation, sha256Hex } from '../../src/storage/library';

// The database persists across tests in this file, so start each one empty.
beforeEach(async () => {
  for (const r of await listCreations()) await deleteCreation(r.id);
});

test('bundle round-trip skips duplicates and renames collisions', async () => {
  const a = await saveCreation({
    name: 'Car',
    code: 'AAAA',
    partCount: 0,
    thumb: null,
    editorMeta: { rootLayout: {} },
  });
  const json = exportBundle([a, { ...a, id: 'z', code: 'BBBB', hash: await sha256Hex('BBBB') }]);
  expect(JSON.parse(json).creations[0].thumb).toBeUndefined();
  expect(await importBundle(json)).toEqual({ added: 1, skipped: 1, renamed: 1 });
  expect((await listCreations()).map((r) => r.name).sort()).toEqual(['Car', 'Car (2)']);
  await expect(importBundle('{"format":"x"}')).rejects.toThrow('Not a GrambyEdit library file.');
});

test('text that is not JSON is not a library file', async () => {
  await expect(importBundle('GrambyEdit')).rejects.toThrow('Not a GrambyEdit library file.');
});

test('malformed records are skipped and the hash is recomputed from the code', async () => {
  const frame = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const record = (fields: object) => ({
    name: 'Car',
    code: 'DDDD',
    partCount: 0,
    schemaVersion: 1,
    editorMeta: { rootLayout: {} },
    ...fields,
  });
  const json = JSON.stringify({
    format: 'grambyedit-library',
    version: 1,
    exportedAt: 0,
    creations: [
      record({ code: 42 }),
      record({ editorMeta: { rootLayout: { 0: [1, 2] } } }),
      record({ editorMeta: { rootLayout: { seven: frame } } }),
      record({ editorMeta: { rootLayout: {}, camera: { position: [0, 0, 0], target: [1, 2] } } }),
      {
        name: 'Ok',
        code: 'CCCC',
        hash: 'forged',
        partCount: 3,
        schemaVersion: 1,
        editorMeta: { rootLayout: { 0: frame } },
      },
    ],
  });
  expect(await importBundle(json)).toEqual({ added: 1, skipped: 4, renamed: 0 });
  const [kept] = await listCreations();
  expect(kept.name).toBe('Ok');
  expect(kept.hash).toBe(await sha256Hex('CCCC'));
});
