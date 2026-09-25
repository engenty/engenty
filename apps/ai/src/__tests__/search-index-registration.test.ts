// The central search.documents store has no FK into ai.thread, so a deleted
// chat stays searchable unless its index rows are removed explicitly.

import { ENGENTY_DEV_SERVICE_URLS_FIXTURE } from "@engenty/environment";
import { createPluginEventsRuntime } from "@engenty/plugin-sdk";
import {
  createSearchIndexRegistry,
  type SearchIndexProvider,
} from "@engenty/search-index";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaticAiScopeResolver } from "../api/http.js";
import {
  AI_CHAT_SESSION_DELETED_EVENT,
  type AiChatSessionEventPayload,
  createApp,
} from "../app.js";
import type { ChatSearchRetrieval } from "../dal/chat-search/index.js";

const tenantId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000003";

describe("apps/ai chat-search index", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("removes a deleted chat session from the index", async () => {
    vi.stubEnv(
      "ENGENTY_CORS_ORIGINS",
      ENGENTY_DEV_SERVICE_URLS_FIXTURE.corsOrigins
    );
    const events = createPluginEventsRuntime({
      bridgeModuleEventsToAutomationHooks: false,
      pluginId: "test/apps-ai",
    }).api;
    const retrieval: ChatSearchRetrieval = {
      provider: {
        capabilities: { hybrid: true, lexical: true, semantic: true },
        id: "ai_chat_search",
        version: "1",
      } as unknown as SearchIndexProvider<never, never, unknown>,
      refreshSession: vi.fn(async () => {}),
      removeSession: vi.fn(async () => {}),
    };
    await createApp({
      chatSearchRetrieval: retrieval,
      events,
      scopeResolver: createStaticAiScopeResolver({ tenantId, userId }),
      searchIndexRegistry: createSearchIndexRegistry(),
    });

    await events.modules.emit<AiChatSessionEventPayload>(
      AI_CHAT_SESSION_DELETED_EVENT,
      { thread_id: threadId, tenant_id: tenantId, user_id: userId },
      { tenantId }
    );

    expect(retrieval.removeSession).toHaveBeenCalledWith({
      thread_id: threadId,
      tenant_id: tenantId,
    });
  });
});
