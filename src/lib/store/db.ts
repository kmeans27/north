/* src/lib/store/db.ts — IndexedDB wrapper, no dependency (06-architecture.md §5).
 *
 * The app only ever talks to the `KeyValueStore` interface, which keeps every
 * consumer testable with an in-memory store and the real thing in the browser.
 *
 * Database `north`, version 1:
 *   days  key = 'YYYY-MM-DD'   value = Day
 *   meta  key = string         value = settings, sync state, undo stack, ledger
 */

export type StoreName = 'days' | 'meta';

export interface KeyValueStore {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  all<T>(store: StoreName): Promise<T[]>;
  keys(store: StoreName): Promise<string[]>;
  clear(store: StoreName): Promise<void>;
}

export const DB_NAME = 'north';
export const DB_VERSION = 1;
export const STORE_NAMES: readonly StoreName[] = ['days', 'meta'];

/* ─── IndexedDB ──────────────────────────────────────────────────────────── */

let connection: Promise<IDBDatabase> | null = null;

function openConnection(): Promise<IDBDatabase> {
  if (connection) return connection;

  connection = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORE_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });

  // A failed open must not poison every later call.
  connection.catch(() => {
    connection = null;
  });

  return connection;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** The real store: one transaction per operation, so no partial writes survive. */
export function createIndexedDbStore(): KeyValueStore {
  const withStore = async <T>(
    store: StoreName,
    mode: IDBTransactionMode,
    run: (objectStore: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> => {
    const db = await openConnection();
    const tx = db.transaction(store, mode);
    const result = await requestResult(run(tx.objectStore(store)));
    await transactionDone(tx);
    return result;
  };

  return {
    async get<T>(store: StoreName, key: string): Promise<T | undefined> {
      return (await withStore(store, 'readonly', (s) => s.get(key))) as T | undefined;
    },
    async put<T>(store: StoreName, key: string, value: T): Promise<void> {
      await withStore(store, 'readwrite', (s) => s.put(value, key));
    },
    async del(store: StoreName, key: string): Promise<void> {
      await withStore(store, 'readwrite', (s) => s.delete(key));
    },
    async all<T>(store: StoreName): Promise<T[]> {
      return (await withStore(store, 'readonly', (s) => s.getAll())) as T[];
    },
    async keys(store: StoreName): Promise<string[]> {
      return (await withStore(store, 'readonly', (s) => s.getAllKeys())) as string[];
    },
    async clear(store: StoreName): Promise<void> {
      await withStore(store, 'readwrite', (s) => s.clear());
    }
  };
}

/* ─── In-memory store ────────────────────────────────────────────────────── */

/**
 * Same contract, no persistence. Backs the demo seed (06-architecture.md §8:
 * "Demo data lives in memory only, never persists") and every unit test.
 * Values are cloned on the way in and out, exactly like IndexedDB's structured
 * clone, so callers can never mutate stored state through a stale reference.
 */
export function createMemoryStore(initial?: Partial<Record<StoreName, Record<string, unknown>>>): KeyValueStore {
  const data = new Map<StoreName, Map<string, unknown>>();
  for (const name of STORE_NAMES) {
    const seed = initial?.[name];
    data.set(name, new Map(seed ? Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]) : []));
  }

  const bucket = (store: StoreName): Map<string, unknown> => {
    const found = data.get(store);
    if (!found) throw new Error(`Unknown store: ${store}`);
    return found;
  };

  return {
    async get<T>(store: StoreName, key: string): Promise<T | undefined> {
      const value = bucket(store).get(key);
      return value === undefined ? undefined : (structuredClone(value) as T);
    },
    async put<T>(store: StoreName, key: string, value: T): Promise<void> {
      bucket(store).set(key, structuredClone(value));
    },
    async del(store: StoreName, key: string): Promise<void> {
      bucket(store).delete(key);
    },
    async all<T>(store: StoreName): Promise<T[]> {
      return [...bucket(store).values()].map((value) => structuredClone(value) as T);
    },
    async keys(store: StoreName): Promise<string[]> {
      return [...bucket(store).keys()];
    },
    async clear(store: StoreName): Promise<void> {
      bucket(store).clear();
    }
  };
}
