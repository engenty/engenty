import type {
  ConnectionSummary,
  InboundMessage,
  StreamPullResult,
} from "@engenty/connections-sdk";
import { describe, expect, it } from "vitest";
import type { InboxRepo, InboxSyncConnection } from "../dal/contracts.js";
import type { InboxSyncState } from "../schema/types.js";
import { runInboxSync } from "./sync-service.js";

function connection(overrides: Partial<ConnectionSummary>): ConnectionSummary {
  return {
    auth_kind: "oauth2",
    autonomous_mode: "read_only",
    connector_id: "google-gmail",
    created_at: "2026-07-01T00:00:00Z",
    display_name: null,
    error_message: null,
    external_account: "user@example.com",
    granted_scopes: [],
    id: "conn-1",
    non_owner_max_group: null,
    owner_user_id: "user-1",
    all_spaces: false,
    sharing: "personal",
    status: "active",
    tenant_id: "tenant-1",
    ...overrides,
  };
}

function message(id: string): InboundMessage {
  return {
    attachments: [],
    body_html: null,
    body_text: `body ${id}`,
    cc: [],
    from_email: "sender@example.com",
    from_name: "Sender",
    provider_message_id: id,
    provider_thread_id: `t-${id}`,
    received_at: "2026-07-04T10:00:00Z",
    subject: `subject ${id}`,
    to: ["user@example.com"],
  };
}

interface FakeRepoState {
  recorded: {
    cursor?: string | null;
    last_error?: string | null;
    touch_synced_at?: boolean;
  }[];
  stored: { connection: InboxSyncConnection; items: InboundMessage[] }[];
  syncStates: Map<string, Partial<InboxSyncState>>;
}

function fakeRepo(state: FakeRepoState): InboxRepo {
  const defaults: InboxSyncState = {
    backfill_days: 90,
    connection_id: "",
    created_at: "",
    cursor: null,
    last_error: null,
    last_error_at: null,
    last_synced_at: null,
    owner_user_id: null,
    scope_id: "default",
    sync_enabled: true,
    tenant_id: "tenant-1",
    updated_at: "",
  };
  return {
    digests: {
      getThreadDigest: () => Promise.resolve(null),
      listMessageDigests: () => Promise.resolve([]),
      upsertMessageDigest: () =>
        Promise.reject(new Error("not used in sync tests")),
      upsertThreadDigest: () =>
        Promise.reject(new Error("not used in sync tests")),
    },
    messages: {
      countUnclassified: () => Promise.resolve(0),
      getById: () => Promise.resolve(null),
      listByThread: () => Promise.resolve([]),
      listUnclassified: () => Promise.resolve([]),
      setCategories: () => Promise.resolve(0),
      setStatus: () => Promise.resolve(0),
    },
    sync: {
      upsertInbound: (conn, items) => {
        state.stored.push({ connection: conn, items });
        return Promise.resolve({ new_messages: items.length });
      },
    },
    syncState: {
      get: (connectionId) => {
        const existing = state.syncStates.get(connectionId);
        return Promise.resolve(
          existing
            ? { ...defaults, ...existing, connection_id: connectionId }
            : null
        );
      },
      list: () => Promise.resolve([]),
      recordResult: (connectionId, patch) => {
        state.recorded.push(patch);
        if (patch.cursor !== undefined) {
          state.syncStates.set(connectionId, {
            ...state.syncStates.get(connectionId),
            cursor: patch.cursor,
          });
        }
        return Promise.resolve();
      },
      upsertSettings: (connectionId, patch) => {
        const merged = {
          ...defaults,
          ...state.syncStates.get(connectionId),
          ...patch,
          connection_id: connectionId,
        } as InboxSyncState;
        state.syncStates.set(connectionId, merged);
        return Promise.resolve(merged);
      },
    },
    threads: {
      getById: () => Promise.resolve(null),
      listPaginated: () => Promise.resolve({ threads: [], total: 0 }),
    },
  };
}

describe("runInboxSync", () => {
  it("backfills across pages, persisting the cursor after each page", async () => {
    const state: FakeRepoState = {
      recorded: [],
      stored: [],
      syncStates: new Map(),
    };
    const pulls: { cursor: string | null; since?: string }[] = [];
    const pages: StreamPullResult[] = [
      {
        hasMore: true,
        items: [message("m1"), message("m2")],
        nextCursor: "p1",
      },
      { hasMore: false, items: [message("m3")], nextCursor: "hist-100" },
    ];
    const result = await runInboxSync({
      connectionsClient: {
        listConnections: () => Promise.resolve([connection({})]),
        pullStream: (params) => {
          pulls.push({ cursor: params.cursor, since: params.since });
          const page = pages.shift();
          if (!page) {
            throw new Error("no more pages");
          }
          return Promise.resolve(page);
        },
      },
      hasMessageStream: () => true,
      repo: fakeRepo(state),
      tenantId: "tenant-1",
    });

    expect(result.connections[0]?.new_messages).toBe(3);
    expect(result.connections[0]?.error).toBeNull();
    // First pull opens the backfill window; the second continues the cursor.
    expect(pulls[0]?.cursor).toBeNull();
    expect(pulls[0]?.since).toBeDefined();
    expect(pulls[1]?.cursor).toBe("p1");
    expect(pulls[1]?.since).toBeUndefined();
    const cursors = state.recorded
      .filter((patch) => patch.cursor !== undefined)
      .map((patch) => patch.cursor);
    expect(cursors).toEqual(["p1", "hist-100"]);
    // Personal connection ⇒ messages stored owner-scoped.
    expect(state.stored[0]?.connection.owner_user_id).toBe("user-1");
  });

  it("re-backfills once when the incremental cursor expired", async () => {
    const state: FakeRepoState = {
      recorded: [],
      stored: [],
      syncStates: new Map([["conn-1", { cursor: "hist-old" }]]),
    };
    const pulls: (string | null)[] = [];
    const result = await runInboxSync({
      connectionsClient: {
        listConnections: () => Promise.resolve([connection({})]),
        pullStream: (params) => {
          pulls.push(params.cursor);
          if (params.cursor === "hist-old") {
            return Promise.reject(
              new Error("gmail_stream_cursor_expired: pull again with null")
            );
          }
          return Promise.resolve({
            hasMore: false,
            items: [message("m1")],
            nextCursor: "hist-new",
          });
        },
      },
      hasMessageStream: () => true,
      repo: fakeRepo(state),
      tenantId: "tenant-1",
    });

    expect(pulls).toEqual(["hist-old", null]);
    expect(result.connections[0]?.error).toBeNull();
    expect(result.connections[0]?.new_messages).toBe(1);
  });

  it("skips off/streamless/disabled connections and isolates failures", async () => {
    const state: FakeRepoState = {
      recorded: [],
      stored: [],
      syncStates: new Map([["conn-disabled", { sync_enabled: false }]]),
    };
    const result = await runInboxSync({
      connectionsClient: {
        listConnections: () =>
          Promise.resolve([
            connection({ autonomous_mode: "off", id: "conn-off" }),
            connection({ connector_id: "slack", id: "conn-slack" }),
            connection({ id: "conn-disabled" }),
            connection({ id: "conn-broken" }),
            connection({ id: "conn-ok" }),
          ]),
        pullStream: (params) => {
          if (params.connectionId === "conn-broken") {
            return Promise.reject(new Error("provider exploded"));
          }
          return Promise.resolve({
            hasMore: false,
            items: [message("m1")],
            nextCursor: "c1",
          });
        },
      },
      hasMessageStream: (connectorId) => connectorId === "google-gmail",
      repo: fakeRepo(state),
      tenantId: "tenant-1",
    });

    const byId = new Map(
      result.connections.map((entry) => [entry.connection_id, entry])
    );
    expect(byId.get("conn-off")?.skipped).toBe("autonomous_off");
    expect(byId.get("conn-slack")?.skipped).toBe("no_stream");
    expect(byId.get("conn-disabled")?.skipped).toBe("sync_disabled");
    expect(byId.get("conn-broken")?.error).toContain("provider exploded");
    // The broken account never blocks the healthy one.
    expect(byId.get("conn-ok")?.new_messages).toBe(1);
    expect(byId.get("conn-ok")?.error).toBeNull();
  });
});
