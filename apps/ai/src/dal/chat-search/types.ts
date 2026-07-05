// Public surface of the chat-search index after the retrieval-service
// cutover (Phase 5a). Storage, chunking, embedding, fusion, and visibility
// live in the central service (`@engenty/retrieval` over `search.*`); this
// file pins the provider id and the response shape HTTP consumers parse
// (engenty-copilot session sidebar, apps/ui dev-settings panel).

import type { AgentSessionStatus } from "../agent-sessions/index.js";

/**
 * Stable provider id on the apps/ai `SearchIndexRegistry` and in the
 * `/ai/v1/search-index/providers/:id/*` routes. The underlying retrieval
 * source type is `ai.chat_session` (see chat-retrieval-source.ts); the
 * manufactured provider is re-exposed under this legacy id so copilot and
 * the UI keep working unchanged.
 */
export const AI_CHAT_SEARCH_PROVIDER_ID = "ai_chat_search";

/**
 * Filters accepted by `POST /providers/ai_chat_search/search`. Everything is
 * optional except the auth-injected tenant/user scope (the route overrides
 * caller-supplied values). `role` and `thread_id` from the legacy per-message
 * index are gone: documents are session-granular now.
 */
export interface AiChatSearchFilters {
  agent_id?: string | null;
  from?: string | null;
  route_key?: string | null;
  status?: AgentSessionStatus | null;
  tenant_id?: string | null;
  to?: string | null;
  user_id?: string | null;
  workspace_key?: string | null;
}

/**
 * Hit item shape — kept field-for-field compatible with the legacy provider
 * so `searchAgentChatSessions` (engenty-copilot) parses results unchanged.
 * `document_type` is always "session" and `role` always null now (one
 * document per session; the transcript carries per-role prefixes in text).
 * `session_id` is additive (alias of `thread_id`).
 */
export interface AiChatSearchHit {
  agent_id: string;
  chunk_id: string;
  chunk_text: string;
  doc_id: string;
  document_type: "session";
  metadata: Record<string, unknown>;
  role: null;
  route_context: Record<string, unknown>;
  run_id: null;
  session_id: string;
  session_status: AgentSessionStatus;
  source_created_at: string | null;
  source_id: string;
  source_updated_at: string;
  tenant_id: string;
  text: string;
  thread_id: string;
  user_id: string;
  workspace_key: string | null;
}
