// Verifies the chat-search store is registered against the unified
// `SearchIndexProvider` contract and that emitting `ai.chat_session.updated`
// triggers `provider.refreshSession`. This pins the new event-driven
// indexing path that replaced the inline `refreshChatSearchSession` hook.

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
import type { AiChatSearchStore } from "../dal/chat-search/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

const scopeResolver = createStaticAiScopeResolver({
  tenantId,
  userId,
});

function makeChatSearchStore(): AiChatSearchStore & SearchIndexProvider {
  // Minimal stub honoring both the `SearchIndexProvider` contract surface and
  // the chat-search-specific helpers the listener calls.
  const store: Partial<AiChatSearchStore & SearchIndexProvider> = {
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
    refreshSession: vi.fn(async () => []),
    replaceDocument: vi.fn(async () => {}),
    search: vi.fn(async () => ({ results: [], total: 0 })),
    version: "1",
  };
  return store as AiChatSearchStore & SearchIndexProvider;
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

  it("registers the chat-search store as `ai_chat_search` with metadata", async () => {
    const registry = createSearchIndexRegistry();
    const store = makeChatSearchStore();
    await createApp({
      chatSearchStore: store,
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

  it("emitting ai.chat_session.updated triggers provider.refreshSession", async () => {
    const registry = createSearchIndexRegistry();
    const store = makeChatSearchStore();
    await createApp({
      chatSearchStore: store,
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

    expect(store.refreshSession).toHaveBeenCalledTimes(1);
    expect(store.refreshSession).toHaveBeenCalledWith({
      thread_id: threadId,
      tenant_id: tenantId,
      user_id: userId,
    });
  });

  it("ai.chat_session.deleted does not call refreshSession (FK cascade owns it)", async () => {
    const registry = createSearchIndexRegistry();
    const store = makeChatSearchStore();
    await createApp({
      chatSearchStore: store,
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

    expect(store.refreshSession).not.toHaveBeenCalled();
    expect(store.deleteDocument).not.toHaveBeenCalled();
  });

  it("registers only core.api_catalog when chat-search store is null", async () => {
    const registry = createSearchIndexRegistry();
    await createApp({
      chatSearchStore: null,
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
