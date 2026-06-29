// Sidebar/sessions search over the user's indexed chat transcripts.
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
import type { AgentSessionDto } from "./agent-session-types.js";

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

export async function searchAgentChatSessions(params: {
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

export function chatSearchHitsToSessions(params: {
  hits: readonly AgentChatSearchHit[];
  knownSessions: readonly AgentSessionDto[];
}): AgentSessionDto[] {
  const knownById = new Map(
    params.knownSessions.map((session) => [session.id, session])
  );
  const orderedSessionIds: string[] = [];
  const bestHitBySession = new Map<string, AgentChatSearchHit>();

  for (const hit of params.hits) {
    const threadId = hit.item.thread_id;
    const existing = bestHitBySession.get(threadId);
    if (!existing || hit.score > existing.score) {
      bestHitBySession.set(threadId, hit);
    }
    if (!orderedSessionIds.includes(threadId)) {
      orderedSessionIds.push(threadId);
    }
  }

  return orderedSessionIds.flatMap((threadId) => {
    const known = knownById.get(threadId);
    if (known) {
      return [known];
    }
    const hit = bestHitBySession.get(threadId);
    if (!hit) {
      return [];
    }
    return [syntheticSessionFromHit(hit)];
  });
}

function syntheticSessionFromHit(hit: AgentChatSearchHit): AgentSessionDto {
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
    status: item.session_status as AgentSessionDto["status"],
    summary: null,
    tenant_id: item.tenant_id,
    title,
    updated_at: item.source_updated_at,
    workspace_key: item.workspace_key,
  };
}
