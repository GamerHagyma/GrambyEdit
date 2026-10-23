import 'fake-indexeddb/auto';
import { clearAutosave, readAutosave, writeAutosave } from '../../src/storage/autosave';

// The database persists across tests in this file, so start each one empty.
beforeEach(() => clearAutosave());

test('autosave read/write/clear', async () => {
  await writeAutosave({
    code: 'AAAA',
    editorMeta: { rootLayout: {} },
    savedAt: 1,
    creationId: null,
  });
  expect((await readAutosave())!.code).toBe('AAAA');
  await clearAutosave();
  expect(await readAutosave()).toBeUndefined();
});
