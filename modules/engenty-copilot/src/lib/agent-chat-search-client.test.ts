import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AgentChatSearchHit,
  chatSearchHitsToThreads,
  searchAgentChatThreads,
} from "./agent-chat-search-client.js";
import type { AgentThreadDto } from "./agent-thread-types.js";

vi.mock("@engenty/api-client", () => ({
  getCurrentAccessToken: vi.fn(async () => "test-token"),
}));

function makeHit(
  overrides: Partial<AgentChatSearchHit> = {}
): AgentChatSearchHit {
  return {
    item: {
      agent_id: "engenty.copilot",
      chunk_id: "chunk-1",
      chunk_text: "Discussed Ada Lovelace",
      doc_id: "ai-chat-message:thread-1:message-1",
      document_type: "message",
      metadata: {},
      role: "user",
      route_context: {},
      run_id: null,
      thread_id: "thread-1",
      session_status: "completed",
      source_created_at: "2026-05-17T00:00:00.000Z",
      source_id: "message-1",
      source_updated_at: "2026-05-17T00:00:00.000Z",
      tenant_id: "tenant-1",
      text: "Discussed Ada Lovelace",
      user_id: "user-1",
      workspace_key: null,
    },
    matched_fields: ["text"],
    score: 1,
    source_scores: { fts: 1 },
    ...overrides,
  };
}

describe("searchAgentChatThreads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("POSTs the unified search-index endpoint with caller bearer token", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ matches: [makeHit()], total: 1 }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchAgentChatThreads({
      agentId: null,
      limit: 10,
      query: "Ada Lovelace",
      serviceBaseUrl: "https://ai.engenty.localhost/",
      tenantId: "tenant-1",
      userId: "user-1",
    });

    expect(result.total).toBe(1);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://ai.engenty.localhost/ai/v1/search-index/providers/ai_chat_search/search"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      limit: 10,
      query: "Ada Lovelace",
    });
  });

  it("forwards an agent_id filter when scoping to a specific agent", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ matches: [makeHit()], total: 1 }), {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchAgentChatThreads({
      agentId: "engenty.copilot",
      limit: 10,
      query: "Ada Lovelace",
      serviceBaseUrl: "https://ai.engenty.localhost/",
      tenantId: "tenant-1",
      userId: "user-1",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      filters: { agent_id: "engenty.copilot" },
      limit: 10,
      query: "Ada Lovelace",
    });
  });
});

describe("chatSearchHitsToThreads", () => {
  it("dedupes hits by thread and prefers loaded thread rows", () => {
    const knownThread: AgentThreadDto = {
      agent_id: "engenty.copilot",
      archived_at: null,
      created_at: "2026-05-16T00:00:00.000Z",
      created_by_user_id: "user-1",
      id: "thread-1",
      metadata: {},
      route_context: {},
      status: "completed",
      summary: null,
      tenant_id: "tenant-1",
      title: "Known title",
      updated_at: "2026-05-16T00:00:00.000Z",
      workspace_key: null,
    };

    const threads = chatSearchHitsToThreads({
      hits: [
        makeHit({ score: 0.5 }),
        makeHit({
          item: {
            ...makeHit().item,
            chunk_id: "chunk-2",
            chunk_text: "Better hit",
          },
          score: 2,
        }),
      ],
      knownThreads: [knownThread],
    });

    expect(threads).toEqual([knownThread]);
  });

  it("creates compact synthetic rows for threads outside the loaded list", () => {
    const threads = chatSearchHitsToThreads({
      hits: [makeHit()],
      knownThreads: [],
    });

    expect(threads).toMatchObject([
      {
        agent_id: "engenty.copilot",
        id: "thread-1",
        tenant_id: "tenant-1",
        title: "Discussed Ada Lovelace",
      },
    ]);
  });
});
