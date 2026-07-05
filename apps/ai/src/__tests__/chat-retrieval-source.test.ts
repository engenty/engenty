// Pins the `ai.chat_session` retrieval source (Phase 5a): document building
// (session-granular text, owner visibility column, filter metadata), filter
// mapping, and — most importantly — the hydrated hit shape engenty-copilot's
// `searchAgentChatSessions` parses (`item.thread_id`, `item.chunk_text`, …).

import type { RetrievalMatch } from "@engenty/retrieval";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { AgentSessionRow } from "../dal/agent-sessions/index.js";
import {
  AI_CHAT_SEARCH_PROVIDER_ID,
  AI_CHAT_SESSION_SOURCE_TYPE,
  createChatSearchRetrieval,
  createChatSessionRetrievalSource,
} from "../dal/chat-search/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000010";

const session: AgentSessionRow = {
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

  it("builds one session document with owner visibility and filter metadata", async () => {
    const document = await source.buildDocument({
      doc_id: threadId,
      tenant_id: tenantId,
    });
    expect(document).not.toBeNull();
    expect(document?.owner_user_id).toBe(userId);
    expect(document?.title).toBe("Transcript title");
    expect(document?.source_updated_at).toBe(session.updated_at);
    expect(document?.text).toContain("Transcript title");
    expect(document?.text).toContain("user: Find contacts");
    expect(document?.filter_metadata).toEqual({
      agent_id: "engenty.copilot",
      route_key: "copilot",
      status: "completed",
      workspace_key: "chat",
    });
  });

  it("returns null for an unknown session (ingest = delete)", async () => {
    const document = await source.buildDocument({
      doc_id: "00000000-0000-4000-8000-00000000dead",
      tenant_id: tenantId,
    });
    expect(document).toBeNull();
  });

  it("registers with user visibility and paragraph splitting", () => {
    expect(source.visibility).toBe("user");
    expect(source.splitter).toEqual({
      max_chunk_length: 1200,
      mode: "paragraph",
    });
  });

  it("maps route filters onto metadata / occurred pushdown", () => {
    const mapped = source.retriever?.mapFilters?.({
      agent_id: "engenty.copilot",
      from: "2026-01-01T00:00:00.000Z",
      status: "completed",
      to: "2026-02-01T00:00:00.000Z",
      workspace_key: "chat",
    });
    expect(mapped).toEqual({
      metadata: {
        agent_id: "engenty.copilot",
        status: "completed",
        workspace_key: "chat",
      },
      occurred_after: "2026-01-01T00:00:00.000Z",
      occurred_before: "2026-02-01T00:00:00.000Z",
    });
  });

  it("hydrates the legacy AiChatSearchHit shape, best chunk per session", async () => {
    const results = await source.retriever?.hydrate?.(
      [
        match(),
        match({ chunk_id: `${threadId}::chunk::1`, chunk_index: 1, score: 1 }),
      ],
      { query: "contacts", tenant_id: tenantId, user_id: userId }
    );
    expect(results).toHaveLength(1);
    const [hit] = results ?? [];
    expect(hit).toMatchObject({
      doc_id: threadId,
      matched_fields: ["text"],
      score: 2.5,
      source_scores: { fts: 1, trigram: 0, vector: 0.5 },
    });
    // The item shape engenty-copilot parses — field-for-field.
    expect(hit?.item).toEqual({
      agent_id: "engenty.copilot",
      chunk_id: `${threadId}::chunk::0`,
      chunk_text: "user: Find contacts",
      doc_id: threadId,
      document_type: "session",
      metadata: { agent_id: "engenty.copilot", status: "completed" },
      role: null,
      route_context: { routeKey: "copilot" },
      run_id: null,
      session_id: threadId,
      session_status: "completed",
      source_created_at: session.created_at,
      source_id: threadId,
      source_updated_at: session.updated_at,
      tenant_id: tenantId,
      text: "user: Find contacts",
      thread_id: threadId,
      user_id: userId,
      workspace_key: "chat",
    });
  });
});

describe("createChatSearchRetrieval", () => {
  it("re-exposes the manufactured provider under the legacy id", () => {
    const retrieval = createChatSearchRetrieval({
      supabase: fakeSupabase({ thread: [], thread_message: [] }),
    });
    expect(retrieval.provider.id).toBe(AI_CHAT_SEARCH_PROVIDER_ID);
    expect(retrieval.provider.capabilities).toEqual({
      hybrid: true,
      lexical: true,
      semantic: true,
    });
    expect(typeof retrieval.provider.search).toBe("function");
    expect(typeof retrieval.provider.backfill).toBe("function");
    expect(typeof retrieval.provider.getStatus).toBe("function");
  });
});
