import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatThreadSearchTool } from "../../ai/tools/chat-thread-search/chat-thread-search-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { setAiSearchIndexRegistry } from "../runtime/ai-search-runtime.js";
import { testToolContext } from "./helpers/tool-context.js";

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

  it("searches only the calling user's chats", async () => {
    const registry = createSearchIndexRegistry();
    const provider = makeProvider();
    registry.register(provider, {
      entityName: "chat_session",
      moduleId: "ai",
    });
    setAiSearchIndexRegistry(registry);

    const tool = createChatThreadSearchTool();
    const result = await engentyToolsRunAls.run(
      { tenantId, accessToken: "user-token", userId },
      () => tool.execute!({ query: "previous chat" }, testToolContext())
    );

    expect(result).toMatchObject({ matches: [{ doc_id: "chat-1" }] });
    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { tenant_id: tenantId, user_id: userId },
      })
    );
  });
});
