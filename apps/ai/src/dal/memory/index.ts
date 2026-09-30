import { createDbSourceFromEnv } from "../../infra/tenant-db.js";
import {
  createMemoryEntryStore,
  type MemoryEntryStore,
} from "./memory-entry-store.js";
import {
  createWorkingMemoryStore,
  type WorkingMemoryStore,
} from "./working-memory-store.js";

export type {
  MemoryEntryRow,
  MemoryEntryStore,
  MemoryKey,
} from "./memory-entry-store.js";
export { createMemoryEntryStore } from "./memory-entry-store.js";
export type {
  WorkingMemoryRow,
  WorkingMemoryStore,
} from "./working-memory-store.js";
export { createWorkingMemoryStore } from "./working-memory-store.js";

let cached: MemoryEntryStore | null | undefined;
let cachedWorking: WorkingMemoryStore | null | undefined;

/** The env-configured store, or null when the database lane is not set up. */
export function getMemoryEntryStore(): MemoryEntryStore | null {
  if (cached === undefined) {
    const source = createDbSourceFromEnv();
    cached = source ? createMemoryEntryStore(source) : null;
  }
  return cached;
}

/** The env-configured working-memory store, or null without a database lane. */
export function getWorkingMemoryStore(): WorkingMemoryStore | null {
  if (cachedWorking === undefined) {
    const source = createDbSourceFromEnv();
    cachedWorking = source ? createWorkingMemoryStore(source) : null;
  }
  return cachedWorking;
}
