// What an idempotent re-upsert of an EXISTING thread must carry forward.
//
// `upsert_thread_with_owner` sets `metadata = excluded.metadata` and
// `summary = excluded.summary` on conflict — wholesale overwrites. A caller
// that re-upserts a thread it did not fully load therefore erases whatever it
// did not send, and `ai.thread.metadata` is where Mastra keeps state that
// accumulates over a thread's life: the working-memory state signals and the
// observational-memory cursor. Losing them is silent, and it surfaces as "the
// agent ran and remembered nothing" — which reads as a model problem, not a
// data one.
//
// This is deliberately a CALLER-side helper rather than a `||` merge in the
// RPC. Mastra's own `saveThread` depends on the replace semantics: it resolves
// the externally-owned HITL keys from the DB row and DELETES the ones the row
// no longer has, because a stale open-interrupt written back from its
// load-time snapshot resurrected the approval card on every reload. Merging in
// SQL would make that delete a no-op and bring the bug back, while making it
// impossible to clear a key through this path at all.
//
// So the rule is: whoever upserts a thread that may already exist reads it
// first and decides, key by key. This helper is that read, for the callers
// whose intent is "add my keys, keep everything else".
import type { ThreadRow } from "./types.js";

export interface PreservedThreadUpsertFields {
  metadata: Record<string, unknown>;
  summary?: string | null;
}

export async function preservedThreadUpsertFields(input: {
  /** The keys this caller owns. They win over what the row already holds. */
  metadata: Record<string, unknown>;
  store: {
    getThread: (params: {
      tenantId: string;
      threadId: string;
    }) => Promise<ThreadRow | null>;
  };
  tenantId: string;
  threadId: string;
}): Promise<PreservedThreadUpsertFields> {
  const existing = await input.store
    .getThread({ tenantId: input.tenantId, threadId: input.threadId })
    // A read failure must not cost the caller its own keys; it only costs the
    // preservation, which is the same position the caller was in before.
    .catch(() => null);
  return {
    metadata: { ...(existing?.metadata ?? {}), ...input.metadata },
    ...(existing?.summary ? { summary: existing.summary } : {}),
  };
}
