import type { InboundMessage } from "@engenty/connections-sdk";
import type {
  InboxMessage,
  InboxMessageStatus,
  InboxSyncState,
  InboxThread,
  InboxThreadsListParams,
  InboxThreadsListResult,
} from "../schema/types.js";

/**
 * Decouples the repo from the plugin events runtime: production wiring
 * forwards to `engenty.events.modules.emit("inbox.message.<verb>", ...)`;
 * tests pass a no-op. `synced` fires once per newly stored message (feeds the
 * search re-index binding and Model-2 triage consumers alike), `updated` on
 * status changes, `deleted` on removal.
 */
export type EmitInboxEvent = (
  verb: "deleted" | "synced" | "updated",
  payload: { message_id: string; scope_id: string; tenant_id: string }
) => void | Promise<void>;

/** The connection facts the upsert path needs (a `ConnectionSummary` subset). */
export interface InboxSyncConnection {
  id: string;
  owner_user_id: string | null;
  sharing: "org" | "personal";
}

export interface InboxUpsertResult {
  new_messages: number;
}

export interface InboxRepo {
  messages: {
    getById(id: string): Promise<InboxMessage | null>;
    listByThread(threadId: string): Promise<InboxMessage[]>;
    setStatus(
      ids: string[],
      status: InboxMessageStatus,
      setBy: string | null
    ): Promise<number>;
  };
  sync: {
    upsertInbound(
      connection: InboxSyncConnection,
      items: InboundMessage[]
    ): Promise<InboxUpsertResult>;
  };
  syncState: {
    get(connectionId: string): Promise<InboxSyncState | null>;
    list(): Promise<InboxSyncState[]>;
    recordResult(
      connectionId: string,
      patch: {
        cursor?: string | null;
        last_error?: string | null;
        touch_synced_at?: boolean;
      }
    ): Promise<void>;
    upsertSettings(
      connectionId: string,
      patch: {
        backfill_days?: number;
        owner_user_id?: string | null;
        sync_enabled?: boolean;
      }
    ): Promise<InboxSyncState>;
  };
  threads: {
    getById(id: string): Promise<InboxThread | null>;
    listPaginated(
      params: InboxThreadsListParams
    ): Promise<InboxThreadsListResult>;
  };
}
