import 'fake-indexeddb/auto';
import { idbPut, idbGet, idbAll, idbDelete } from '../../src/storage/idb';

test('put, get, all, delete', async () => {
  await idbPut('sockets', { a: 1 }, 'overrides');
  expect(await idbGet('sockets', 'overrides')).toEqual({ a: 1 });
  await idbPut('creations', { id: 'x', name: 'n' });
  expect((await idbAll<{ id: string }>('creations')).map((r) => r.id)).toEqual(['x']);
  await idbDelete('creations', 'x');
  expect(await idbAll('creations')).toEqual([]);
});
test('a missing key reads as undefined', async () =>
  expect(await idbGet('thumbs', 'nope')).toBeUndefined());
