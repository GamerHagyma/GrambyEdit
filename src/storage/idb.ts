// IndexedDB storage (spec §14): database `grambyedit` v1 with four stores. Every call can fail
// (private windows, quota, blocked storage); failures reject with a typed StorageError for a toast.
export type StoreName = 'creations' | 'autosave' | 'thumbs' | 'sockets';

export class StorageError extends Error {
  constructor(
    readonly kind: 'quota' | 'unavailable' | 'other',
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

function wrap(e: DOMException | null | undefined): StorageError {
  if (e?.name === 'QuotaExceededError') {
    return new StorageError(
      'quota',
      'Browser storage is full. Export your library and delete old creations.',
    );
  }
  return new StorageError('other', `Browser storage failed: ${e?.message ?? 'unknown error'}.`);
}

let dbPromise: Promise<IDBDatabase> | null = null;

/** Opens (and on first use creates) the database; a failed open is retried on the next call. */
export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open('grambyedit', 1);
    } catch {
      reject(new StorageError('unavailable', 'Browser storage is unavailable in this window.'));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('creations'))
        db.createObjectStore('creations', { keyPath: 'id' });
      for (const name of ['autosave', 'thumbs', 'sockets']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: step aside and reopen on the next call.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(wrap(req.error));
  }).catch((e: unknown) => {
    dbPromise = null;
    throw e;
  });
  return dbPromise;
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(wrap(tx.error));
        tx.onabort = () => reject(wrap(tx.error));
      }),
  );
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key));
}

/** `creations` uses the value's `id` as key; the other stores take an explicit key. */
export async function idbPut(store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  await run(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)));
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  await run(store, 'readwrite', (s) => s.delete(key));
}

export async function idbClear(store: StoreName): Promise<void> {
  await run(store, 'readwrite', (s) => s.clear());
}

export function idbAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll());
}
