// Dünne IndexedDB-Schicht. Alles bleibt auf dem Gerät.
const STORES = ['tracks', 'playlists', 'settings', 'recordings'] as const;
type Store = (typeof STORES)[number];
let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (opening ??= new Promise((resolve, reject) => {
    const r = indexedDB.open('airwave', 1);
    r.onupgradeneeded = () => {
      for (const s of STORES)
        if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

async function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await open();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      const e = req.error;
      reject(e?.name === 'QuotaExceededError' ? new Error('Der lokale Speicher ist voll. Bitte lösche alte Aufnahmen.') : e);
    };
  });
}

export const db = {
  all: <T>(s: Store) => run<T[]>(s, 'readonly', (o) => o.getAll() as IDBRequest<T[]>),
  get: <T>(s: Store, key: string) => run<T | undefined>(s, 'readonly', (o) => o.get(key) as IDBRequest<T | undefined>),
  put: (s: Store, v: unknown) => run(s, 'readwrite', (o) => o.put(v)),
  del: (s: Store, key: string) => run(s, 'readwrite', (o) => o.delete(key)),
};
