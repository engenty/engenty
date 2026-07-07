const DB_NAME = "engenty-local-files";
const STORE = "handles";

/**
 * Minimal IndexedDB wrapper storing one `FileSystemDirectoryHandle` per
 * connection id. Directory handles are structured-cloneable in Chromium, so
 * they persist across reloads and browser restarts (subject to the user
 * re-confirming permission).
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function putHandle(
  connectionId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  await tx("readwrite", (store) => store.put(handle, connectionId));
}

export async function getHandle(
  connectionId: string
): Promise<FileSystemDirectoryHandle | undefined> {
  return tx("readonly", (store) => store.get(connectionId)) as Promise<
    FileSystemDirectoryHandle | undefined
  >;
}

export async function deleteHandle(connectionId: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(connectionId));
}

export async function listHandleKeys(): Promise<string[]> {
  const keys = await tx("readonly", (store) => store.getAllKeys());
  return (keys as IDBValidKey[]).map(String);
}

/** Drop stored handles whose connection no longer exists. */
export async function reconcileHandles(liveIds: Set<string>): Promise<void> {
  for (const key of await listHandleKeys()) {
    if (!liveIds.has(key)) {
      await deleteHandle(key);
    }
  }
}
