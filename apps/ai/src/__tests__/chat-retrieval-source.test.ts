import type { RetrievalMatch } from "@engenty/retrieval";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  AI_CHAT_SESSION_SOURCE_TYPE,
  createChatSessionRetrievalSource,
} from "../dal/chat-search/index.js";
import type { ThreadRow } from "../dal/threads/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000010";

const session: ThreadRow = {
  agent_id: "engenty.copilot",
  archived_at: null,
  created_at: "2026-05-17T00:00:00.000Z",
  created_by_user_id: userId,
  id: threadId,
  metadata: {},
  route_context: { routeKey: "copilot" },
  status: "completed",
  summary: "A saved summary",
  tenant_id: tenantId,
  title: "Transcript title",
  updated_at: "2026-05-17T00:01:00.000Z",
  space_id: null,
  visibility: "space",
  workspace_key: "chat",
};

const messages = [
  {
    author_user_id: userId,
    created_at: "2026-05-17T00:00:11.000Z",
    id: "00000000-0000-4000-8000-000000000011",
    parts: [{ text: "Find contacts", type: "text" }],
    role: "user",
    tenant_id: tenantId,
    thread_id: threadId,
  },
];

// Minimal thenable PostgREST-builder fake: applies eq/in filters against
// in-memory rows and resolves `{ data, error }`.
function makeBuilder(rows: Record<string, unknown>[]) {
  let filtered = rows;
  const builder = {
    eq(column: string, value: unknown) {
      filtered = filtered.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      filtered = filtered.filter((row) => values.includes(row[column]));
      return builder;
    },
    limit(count: number) {
      filtered = filtered.slice(0, count);
      return builder;
    },
    maybeSingle() {
      return Promise.resolve({ data: filtered[0] ?? null, error: null });
    },
    order() {
      return builder;
    },
    select() {
      return builder;
    },
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable fake
    then(
      resolve: (value: { data: unknown; error: null }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({ data: filtered, error: null }).then(
        resolve,
        reject
      );
    },
    upsert() {
      return Promise.resolve({ data: null, error: null });
    },
  };
  return builder;
}

function fakeSupabase(tables: Record<string, Record<string, unknown>[]>) {
  return {
    schema: () => ({
      from: (table: string) => makeBuilder(tables[table] ?? []),
      rpc: () =>
        Promise.resolve({ data: { matches: [], total: 0 }, error: null }),
    }),
  } as unknown as SupabaseClient;
}

function match(overrides: Partial<RetrievalMatch> = {}): RetrievalMatch {
  return {
    chunk_id: `${threadId}::chunk::0`,
    chunk_index: 0,
    doc_id: threadId,
    matched_fields: ["text"],
    metadata: { agent_id: "engenty.copilot", status: "completed" },
    module: "ai",
    occurred_at: session.updated_at,
    score: 2.5,
    source_scores: { fts: 1, trigram: 0, vector: 0.5 },
    source_type: AI_CHAT_SESSION_SOURCE_TYPE,
    text: "user: Find contacts",
    title: session.title,
    ...overrides,
  };
}

describe("createChatSessionRetrievalSource", () => {
  const source = createChatSessionRetrievalSource({
    supabase: fakeSupabase({
      thread: [session as unknown as Record<string, unknown>],
      thread_message: messages,
    }),
  });

  it("indexes a session as visible only to its creator", async () => {
    const document = await source.buildDocument({
      doc_id: threadId,
      tenant_id: tenantId,
    });
    expect(source.visibility).toBe("user");
    expect(document?.owner_user_id).toBe(userId);
  });

  it("returns null for an unknown session (ingest = delete)", async () => {
    const document = await source.buildDocument({
      doc_id: "00000000-0000-4000-8000-00000000dead",
      tenant_id: tenantId,
    });
    expect(document).toBeNull();
  });

  // engenty-copilot's searchAgentChatSessions parses this item shape.
  it("hydrates one hit per session carrying its best chunk", async () => {
    const results = await source.retriever?.hydrate?.(
      [
        match(),
        match({
          chunk_id: `${threadId}::chunk::1`,
          chunk_index: 1,
          score: 1,
          text: "weaker chunk",
        }),
      ],
      { query: "contacts", tenant_id: tenantId, user_id: userId }
    );
    expect(results).toHaveLength(1);
    expect(results?.[0]?.item).toMatchObject({
      chunk_text: "user: Find contacts",
      thread_id: threadId,
    });
  });
});
