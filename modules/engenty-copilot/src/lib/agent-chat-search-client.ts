// Sidebar/threads search over the user's indexed chat transcripts.
// Talks to apps/ai's per-user `/ai/v1/search-index/providers/ai.chat_search/search`
// route — the same `SearchIndexProvider` contract the Mastra
// `chatThreadSearch` tool uses internally. Caller scope (tenant/user)
// is enforced server-side; the client only forwards the optional
// `agent_id` filter for per-agent narrowing.

import {
  agentRequestHeaders,
  buildAppsAiHttpError,
  normalizeAppsAiServiceBaseUrl,
} from "./agent-api-shared.js";
import type { AgentThreadDto } from "./agent-thread-types.js";

const CHAT_SEARCH_PROVIDER_ID = "ai_chat_search";

export interface AgentChatSearchHitItem {
  agent_id: string;
  chunk_id: string;
  chunk_text: string;
  doc_id: string;
  document_type: string;
  metadata: Record<string, unknown>;
  role: string;
  route_context: Record<string, unknown>;
  run_id: string | null;
  session_status: string;
  source_created_at: string;
  source_id: string;
  source_updated_at: string;
  tenant_id: string;
  text: string;
  thread_id: string;
  user_id: string;
  workspace_key: string | null;
}

export interface AgentChatSearchHit {
  item: AgentChatSearchHitItem;
  matched_fields: string[];
  score: number;
  source_scores: Record<string, number>;
}

interface SearchIndexSearchResponse {
  id: string;
  matches: unknown;
  total: unknown;
}

function chatSearchProviderSearchPath(serviceBaseUrl: string): string {
  return `${normalizeAppsAiServiceBaseUrl(serviceBaseUrl)}/ai/v1/search-index/providers/${CHAT_SEARCH_PROVIDER_ID}/search`;
}

export async function searchAgentChatThreads(params: {
  agentId?: string | null;
  limit?: number;
  query: string;
  serviceBaseUrl: string;
  signal?: AbortSignal;
  tenantId: string;
  userId: string;
}): Promise<{ matches: AgentChatSearchHit[]; total: number }> {
  // Server-side enforces tenant_id / user_id from the caller's bearer; we
  // only forward the agent narrowing filter.
  void params.tenantId;
  void params.userId;
  const agentId = params.agentId?.trim();
  const filters: Record<string, unknown> = {};
  if (agentId) {
    filters.agent_id = agentId;
  }
  const body: Record<string, unknown> = {
    query: params.query,
  };
  if (params.limit != null) {
    body.limit = params.limit;
  }
  if (Object.keys(filters).length > 0) {
    body.filters = filters;
  }
  const res = await fetch(chatSearchProviderSearchPath(params.serviceBaseUrl), {
    body: JSON.stringify(body),
    headers: await agentRequestHeaders(),
    method: "POST",
    signal: params.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw buildAppsAiHttpError("ai chat search", res.status, raw);
  }
  const parsed = JSON.parse(raw) as SearchIndexSearchResponse;
  return {
    matches: Array.isArray(parsed.matches)
      ? (parsed.matches as AgentChatSearchHit[])
      : [],
    total: typeof parsed.total === "number" ? parsed.total : 0,
  };
}

export function chatSearchHitsToThreads(params: {
  hits: readonly AgentChatSearchHit[];
  knownThreads: readonly AgentThreadDto[];
}): AgentThreadDto[] {
  const knownById = new Map(
    params.knownThreads.map((thread) => [thread.id, thread])
  );
  const orderedThreadIds: string[] = [];
  const bestHitByThread = new Map<string, AgentChatSearchHit>();

  for (const hit of params.hits) {
    const threadId = hit.item.thread_id;
    const existing = bestHitByThread.get(threadId);
    if (!existing || hit.score > existing.score) {
      bestHitByThread.set(threadId, hit);
    }
    if (!orderedThreadIds.includes(threadId)) {
      orderedThreadIds.push(threadId);
    }
  }

  return orderedThreadIds.flatMap((threadId) => {
    const known = knownById.get(threadId);
    if (known) {
      return [known];
    }
    const hit = bestHitByThread.get(threadId);
    if (!hit) {
      return [];
    }
    return [syntheticThreadFromHit(hit)];
  });
}

function syntheticThreadFromHit(hit: AgentChatSearchHit): AgentThreadDto {
  const item = hit.item;
  const title = item.chunk_text.trim().slice(0, 512) || null;
  return {
    agent_id: item.agent_id,
    archived_at: null,
    created_at: item.source_created_at,
    created_by_user_id: item.user_id,
    id: item.thread_id,
    metadata: {},
    route_context: {},
    // The search index carries no space. Null rather than a guess: the only
    // reader that acts on this field warns about a cross-space chat, and it
    // must not fire on a row that simply does not know.
    space_id: null,
    status: item.session_status as AgentThreadDto["status"],
    summary: null,
    tenant_id: item.tenant_id,
    title,
    updated_at: item.source_updated_at,
    workspace_key: item.workspace_key,
  };
}
