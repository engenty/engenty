import {
  buildMastraChatSessionSearchTool,
  type ToolExecutionContext,
} from "@engenty/ai-core";
import type { SearchIndexProvider } from "@engenty/search-index";
import { createTool } from "@mastra/core/tools";
import { getAiSearchIndexRegistry } from "../../../src/runtime/ai-search-runtime.js";
import { getEngentyToolsRunContext } from "../engenty-tools/lib/run-context.js";

const CHAT_SEARCH_PROVIDER_ID = "ai_chat_search";

export interface ChatSessionIndexHealthPayload {
  hint?: string;
  index?: Record<string, unknown>;
  index_health: "degraded" | "missing" | "ok";
  ok: boolean;
}

export interface ChatSessionSearchPayload {
  matches: unknown[];
  total: number;
}

interface ChatSessionSearchInvokeInput {
  limit?: number;
  query: string;
  strategy?: "hybrid" | "lexical" | "semantic";
}

function evaluateIndexHealth(status: {
  indexed_count: number;
  missing_count: number;
  total_count: number;
}): Pick<ChatSessionIndexHealthPayload, "index_health" | "ok"> {
  // Mirrors the historical chat-search health classification on top of the
  // unified `SearchIndexStatus` shape: empty -> ok, no docs -> missing,
  // any missing -> degraded, otherwise ok.
  if (status.total_count === 0) {
    return { index_health: "ok", ok: true };
  }
  if (status.indexed_count === 0) {
    return { index_health: "missing", ok: false };
  }
  if (status.missing_count > 0) {
    return { index_health: "degraded", ok: false };
  }
  return { index_health: "ok", ok: true };
}

function resolveProvider(): SearchIndexProvider {
  const registry = getAiSearchIndexRegistry();
  const provider = registry?.get(CHAT_SEARCH_PROVIDER_ID);
  if (!provider) {
    throw new Error(
      "Chat session search registry is unavailable on this run. Did createApp() complete?"
    );
  }
  return provider;
}

async function loadIndexHealth(
  provider: SearchIndexProvider,
  scope: { tenantId: string; userId: string }
): Promise<ChatSessionIndexHealthPayload> {
  if (!provider.getStatus) {
    return { index_health: "ok", ok: true };
  }
  const status = await provider.getStatus({
    tenant_id: scope.tenantId,
    user_id: scope.userId,
  });
  const health = evaluateIndexHealth(status);
  return {
    ...(health.ok
      ? {}
      : {
          hint: "Open Settings → Development → Search index to rebuild the session index when results must be complete.",
        }),
    index: {
      indexed_count: status.indexed_count,
      last_indexed_at: status.last_indexed_at,
      missing_count: status.missing_count,
      stale_count: status.stale_count,
      total_count: status.total_count,
    },
    index_health: health.index_health,
    ok: health.ok,
  };
}

async function searchProvider(
  provider: SearchIndexProvider,
  scope: { tenantId: string; userId: string },
  input: ChatSessionSearchInvokeInput
): Promise<ChatSessionSearchPayload> {
  const result = await provider.search({
    filters: { tenant_id: scope.tenantId, user_id: scope.userId },
    limit: input.limit ?? 20,
    query: input.query,
    strategy: input.strategy ?? "hybrid",
  });
  return {
    matches: result.results,
    total: result.total,
  };
}

export function createChatSessionSearchTool() {
  return buildMastraChatSessionSearchTool(createTool, {
    callGatewayMethod: async (name, input) => {
      const ctx = getEngentyToolsRunContext();
      const tenantId = ctx.tenantId?.trim();
      const userId = ctx.userId?.trim();
      if (!(tenantId && userId)) {
        throw new Error(
          "Chat session search requires tenant + user scope on this run."
        );
      }
      const provider = resolveProvider();
      const scope = { tenantId, userId };
      if (name === "ai_chat_sessions_index_health") {
        return loadIndexHealth(provider, scope);
      }
      if (name === "ai_chat_sessions_search") {
        return searchProvider(
          provider,
          scope,
          input as ChatSessionSearchInvokeInput
        );
      }
      throw new Error(`Unsupported chat session search method: ${name}`);
    },
    get orchestratorSessionId() {
      return getEngentyToolsRunContext().orchestratorSessionId ?? null;
    },
    scope: null,
    scopeId: null,
    get tenantId() {
      return getEngentyToolsRunContext().tenantId ?? null;
    },
    get userId() {
      return getEngentyToolsRunContext().userId ?? null;
    },
  } satisfies ToolExecutionContext);
}
