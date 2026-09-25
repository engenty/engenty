"use client";

// The newest page of the most recently opened chats, kept in this browser
// (IndexedDB) so a chat opens from it at once after a reload — the network
// refresh then replaces it. Only the person who stored a page reads it back:
// pages are stamped with tenant + user, another person's are dropped on load,
// and signing out clears the store.

import type { QueryClient } from "@engenty/query-client";
import {
  APPS_AI_THREAD_CACHE_GC_MS,
  type AppsAiThreadMessagesCursor,
  type AppsAiThreadMessagesPage,
  appsAiThreadMessagesQueryKey,
  appsAiThreadQueryRoot,
} from "../ag-ui/apps-ai/apps-ai-thread-api.js";

const DB_NAME = "engenty-thread-transcripts";
/** Bump when the stored page shape changes: older stores are dropped. */
const DB_VERSION = 1;
const STORE = "pages";
const KEEP_THREADS = 20;
const WRITE_DELAY_MS = 800;

interface StoredPage {
  key: string;
  owner: string;
  page: AppsAiThreadMessagesPage;
  savedAt: number;
  serviceBaseUrl: string;
  threadId: string;
}

interface MessagesData {
  pageParams: (AppsAiThreadMessagesCursor | null)[];
  pages: AppsAiThreadMessagesPage[];
}

function openStore(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.contains(STORE)) {
          db.deleteObjectStore(STORE);
        }
        db.createObjectStore(STORE, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAll(db: IDBDatabase): Promise<StoredPage[]> {
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredPage[]);
    request.onerror = () => resolve([]);
  });
}

function writeTx(
  db: IDBDatabase,
  run: (store: IDBObjectStore) => void
): Promise<void> {
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

function isMessagesKey(
  queryKey: readonly unknown[]
): queryKey is readonly [string, string, "messages", string, string] {
  return (
    queryKey.length === 5 &&
    queryKey[0] === appsAiThreadQueryRoot[0] &&
    queryKey[1] === appsAiThreadQueryRoot[1] &&
    queryKey[2] === "messages" &&
    typeof queryKey[3] === "string" &&
    typeof queryKey[4] === "string" &&
    queryKey[4].length > 0
  );
}

/**
 * Seed the query cache from the store, then keep the store following the
 * cache. Returns the unsubscribe. A thread whose query already holds data
 * (fetched faster than the store opened) keeps it.
 */
export function startThreadTranscriptStore(
  queryClient: QueryClient,
  owner: string
): () => void {
  // Seeded pages have no lane watching them yet; they must outlive the
  // default five minutes like any transcript a lane loaded.
  queryClient.setQueryDefaults([...appsAiThreadQueryRoot, "messages"], {
    gcTime: APPS_AI_THREAD_CACHE_GC_MS,
  });
  let stopped = false;
  let db: IDBDatabase | null = null;
  const pending = new Map<string, StoredPage>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    if (!db || pending.size === 0) {
      return;
    }
    const writes = [...pending.values()];
    pending.clear();
    const all = await readAll(db);
    const kept = new Map(all.map((entry) => [entry.key, entry]));
    for (const entry of writes) {
      kept.set(entry.key, entry);
    }
    const stale = [...kept.values()]
      .toSorted((left, right) => right.savedAt - left.savedAt)
      .slice(KEEP_THREADS)
      .map((entry) => entry.key);
    await writeTx(db, (store) => {
      for (const entry of writes) {
        store.put(entry);
      }
      for (const key of stale) {
        store.delete(key);
      }
    });
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type !== "updated" ||
      event.action.type !== "success" ||
      // Our own seeding (setQueryData) is not news to store.
      (event.action as { manual?: boolean }).manual === true ||
      !isMessagesKey(event.query.queryKey)
    ) {
      return;
    }
    const [, , , serviceBaseUrl, threadId] = event.query.queryKey;
    const data = event.query.state.data as MessagesData | undefined;
    const newest = data?.pages[0];
    if (!newest) {
      return;
    }
    const key = `${owner}|${serviceBaseUrl}|${threadId}`;
    pending.set(key, {
      key,
      owner,
      page: newest,
      savedAt: Date.now(),
      serviceBaseUrl,
      threadId,
    });
    if (!timer) {
      timer = setTimeout(() => void flush(), WRITE_DELAY_MS);
    }
  });

  void openStore().then(async (opened) => {
    if (stopped || !opened) {
      opened?.close();
      return;
    }
    db = opened;
    const all = await readAll(opened);
    const foreign = all.filter((entry) => entry.owner !== owner);
    if (foreign.length > 0) {
      await writeTx(opened, (store) => {
        for (const entry of foreign) {
          store.delete(entry.key);
        }
      });
    }
    if (stopped) {
      return;
    }
    for (const entry of all) {
      if (entry.owner !== owner) {
        continue;
      }
      const queryKey = appsAiThreadMessagesQueryKey({
        serviceBaseUrl: entry.serviceBaseUrl,
        threadId: entry.threadId,
      });
      if (queryClient.getQueryData(queryKey)) {
        continue;
      }
      // Stamped with its save time, so it reads as stale and the lane still
      // refreshes it on open.
      queryClient.setQueryData<MessagesData>(
        queryKey,
        { pageParams: [null], pages: [entry.page] },
        { updatedAt: entry.savedAt }
      );
    }
  });

  return () => {
    stopped = true;
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
    }
    void flush().finally(() => db?.close());
  };
}

/** Drop every stored transcript — on sign-out. */
export async function clearThreadTranscriptStore(): Promise<void> {
  const db = await openStore();
  if (!db) {
    return;
  }
  await writeTx(db, (store) => store.clear());
  db.close();
}
