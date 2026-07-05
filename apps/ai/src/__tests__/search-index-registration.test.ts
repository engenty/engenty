// Verifies the chat-search retrieval provider is registered under the
// legacy `ai_chat_search` id and that the `ai.chat_session.updated` /
// `.deleted` events drive `refreshSession` / `removeSession` on the
// apps/ai-local retrieval assembly (retrieval-service Phase 5a: the central
// search.documents store has no FK into ai.thread, so deletes are explicit).

import { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "@engenty/environment";
import {
  createPluginEventsRuntime,
  type PluginEventsApi,
} from "@engenty/plugin-sdk";
import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import {
  AI_CHAT_SESSION_DELETED_EVENT,
  AI_CHAT_SESSION_UPDATED_EVENT,
  type AiChatSessionEventPayload,
  createApp,
} from "../app.js";
import type { ChatSearchRetrieval } from "../dal/chat-search/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

const scopeResolver = createStaticAiScopeResolver({
  tenantId,
  userId,
});

function makeChatSearchRetrieval(): ChatSearchRetrieval {
  const provider = {
    capabilities: { hybrid: true, lexical: true, semantic: true },
    deleteDocument: vi.fn(async () => {}),
    getDocumentById: vi.fn(async () => null),
    getStatus: vi.fn(async () => ({
      current_count: 0,
      indexed_count: 0,
      last_indexed_at: null,
      missing_count: 0,
      stale_count: 0,
      total_count: 0,
    })),
    id: "ai_chat_search",
    replaceDocument: vi.fn(async () => {}),
    search: vi.fn(async () => ({ results: [], total: 0 })),
    version: "1",
  } as unknown as SearchIndexProvider<never, never, unknown>;
  return {
    provider,
    refreshSession: vi.fn(async () => {}),
    removeSession: vi.fn(async () => {}),
  };
}

describe("apps/ai search-index registration", () => {
  let events: PluginEventsApi;

  beforeEach(() => {
    vi.stubEnv(
      "ENGENTY_CORS_ORIGINS",
      ENGENTY_DEV_SERVICE_URLS_FIXTURE.corsOrigins
    );
    events = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
      pluginId: "test/apps-ai",
    }).api;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("registers the chat-search provider as `ai_chat_search` with metadata", async () => {
    const registry = createSearchIndexRegistry();
    const retrieval = makeChatSearchRetrieval();
    await createApp({
      chatSearchRetrieval: retrieval,
      events,
      scopeResolver,
      searchIndexRegistry: registry,
    });

    const registration = registry.getRegistration("ai_chat_search");
    expect(registration).toBeDefined();
    expect(registration?.metadata.moduleId).toBe("ai");
    expect(registration?.metadata.entityName).toBe("chat_session");
    expect(registration?.metadata.isSystem).toBe(false);
    expect(registration?.metadata.capabilities).toEqual({
      hybrid: true,
      lexical: true,
      semantic: true,
    });
    // `skipAutoTool` was passed, so no synthesized operation id.
    expect(registration?.metadata.operationId).toBeUndefined();
  });

  it("emitting ai.chat_session.updated triggers refreshSession", async () => {
    const registry = createSearchIndexRegistry();
    const retrieval = makeChatSearchRetrieval();
    await createApp({
      chatSearchRetrieval: retrieval,
      events,
      scopeResolver,
      searchIndexRegistry: registry,
    });

    await events.modules.emit<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_UPDATED_EVENT,
      {
        thread_id: threadId,
        tenant_id: tenantId,
        user_id: userId,
      },
      { tenantId }
    );

    expect(retrieval.refreshSession).toHaveBeenCalledTimes(1);
    expect(retrieval.refreshSession).toHaveBeenCalledWith({
      thread_id: threadId,
      tenant_id: tenantId,
    });
    expect(retrieval.removeSession).not.toHaveBeenCalled();
  });

  it("emitting ai.chat_session.deleted triggers removeSession (no FK cascade anymore)", async () => {
    const registry = createSearchIndexRegistry();
    const retrieval = makeChatSearchRetrieval();
    await createApp({
      chatSearchRetrieval: retrieval,
      events,
      scopeResolver,
      searchIndexRegistry: registry,
    });

    await events.modules.emit<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_DELETED_EVENT,
      {
        thread_id: threadId,
        tenant_id: tenantId,
        user_id: userId,
      },
      { tenantId }
    );

    expect(retrieval.removeSession).toHaveBeenCalledTimes(1);
    expect(retrieval.removeSession).toHaveBeenCalledWith({
      thread_id: threadId,
      tenant_id: tenantId,
    });
    expect(retrieval.refreshSession).not.toHaveBeenCalled();
  });

  it("registers only core.api_catalog when chat-search retrieval is null", async () => {
    const registry = createSearchIndexRegistry();
    await createApp({
      chatSearchRetrieval: null,
      events,
      scopeResolver,
      searchIndexRegistry: registry,
    });

    // `core_api_catalog` is always registered as a cross-process proxy so
    // the agent-side `engenty_tools_search` tool can resolve it through
    // the in-process registry; chat-search is the optional one.
    expect(registry.list().map((p) => p.id)).toEqual(["core_api_catalog"]);
  });
});
