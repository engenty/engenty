import type { OrchestratorThreadRecord } from "../contracts.js";

export interface ThreadStore {
  getById(id: string): Promise<OrchestratorThreadRecord | null>;
  upsert(
    record: Partial<OrchestratorThreadRecord> &
      Pick<OrchestratorThreadRecord, "id">
  ): Promise<OrchestratorThreadRecord>;
}

const THREAD_STORE_KEY = Symbol.for("engenty.ai-core.threadStore");

export function configureThreadStore(store: ThreadStore | null): void {
  const target = globalThis as Record<PropertyKey, unknown>;
  target[THREAD_STORE_KEY] = store;
}

export function getThreadStore(): ThreadStore | null {
  const target = globalThis as Record<PropertyKey, unknown>;
  const store = target[THREAD_STORE_KEY];
  return store ? (store as ThreadStore) : null;
}
