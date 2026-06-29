import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatThreadSearchTool } from "../../ai/tools/chat-thread-search/chat-thread-search-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import {
  getAiSearchIndexRegistry,
  setAiSearchIndexRegistry,
} from "../runtime/ai-search-runtime.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function makeProvider(
  overrides: Partial<SearchIndexProvider> = {}
): SearchIndexProvider {
  return {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    deleteDocument: vi.fn(async () => {}),
    getStatus: vi.fn(async () => ({
      current_count: 1,
      indexed_count: 1,
      last_indexed_at: "2026-05-21T00:00:00.000Z",
      missing_count: 0,
      stale_count: 0,
      total_count: 1,
    })),
    id: "ai_chat_search",
    replaceDocument: vi.fn(async () => {}),
    search: vi.fn(async () => ({
      results: [{ doc_id: "chat-1" }],
      total: 1,
    })),
    version: "1",
    ...overrides,
  } as SearchIndexProvider;
}

describe("createChatThreadSearchTool", () => {
  afterEach(() => {
    setAiSearchIndexRegistry(null);
  });

  it("resolves the chat-search provider from the registry and runs index_health + search", async () => {
    const previous = getAiSearchIndexRegistry();
    const registry = createSearchIndexRegistry();
    const provider = makeProvider();
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    setAiSearchIndexRegistry(registry);

    try {
      const tool = createChatThreadSearchTool();
      const result = await engentyToolsRunAls.run(
        {
          tenantId,
          userAccessToken: "user-token",
          userId,
        },
        () => tool.execute({ query: "previous chat" })
      );

      expect(result).toMatchObject({
        index_health: "ok",
        matches: [{ doc_id: "chat-1" }],
        total: 1,
      });

      expect(provider.getStatus).toHaveBeenCalledWith({
        tenant_id: tenantId,
        user_id: userId,
      });
      expect(provider.search).toHaveBeenCalledWith({
        filters: { tenant_id: tenantId, user_id: userId },
        limit: 20,
        query: "previous chat",
        strategy: "hybrid",
      });
    } finally {
      setAiSearchIndexRegistry(previous);
    }
  });

  it("flags a missing index when total > 0 but indexed_count is 0", async () => {
    const previous = getAiSearchIndexRegistry();
    const registry = createSearchIndexRegistry();
    const provider = makeProvider({
      getStatus: vi.fn(async () => ({
        current_count: 0,
        indexed_count: 0,
        last_indexed_at: null,
        missing_count: 3,
        stale_count: 0,
        total_count: 3,
      })),
      search: vi.fn(async () => ({ results: [], total: 0 })),
    });
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    setAiSearchIndexRegistry(registry);

    try {
      const tool = createChatThreadSearchTool();
      // Distinct orchestratorThreadId so the per-process index health cache
      // in @engenty/ai-core does not return a stale "ok" from another test.
      const result = (await engentyToolsRunAls.run(
        {
          orchestratorThreadId: "00000000-0000-4000-8000-0000000000ee",
          tenantId,
          userAccessToken: "user-token",
          userId,
        },
        () => tool.execute({ query: "previous chat" })
      )) as { index_health: string; index_notice?: string };

      expect(result.index_health).toBe("missing");
      expect(result.index_notice).toContain("rebuild");
    } finally {
      setAiSearchIndexRegistry(previous);
    }
  });

  it("returns an error result when the registry is empty", async () => {
    setAiSearchIndexRegistry(null);
    const tool = createChatThreadSearchTool();
    const result = (await engentyToolsRunAls.run(
      {
        tenantId,
        userAccessToken: "user-token",
        userId,
      },
      () => tool.execute({ query: "previous chat" })
    )) as { error?: string };
    expect(result.error).toContain(
      "Chat thread search registry is unavailable"
    );
  });
});
