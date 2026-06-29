import type {
  SearchCandidate,
  SearchDocument,
  SearchIndexProvider,
  SearchRequest,
  SearchResponse,
  SearchSourceScores,
} from "@engenty/search-index";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
  AgentSessionStatus,
  SessionMessageRole,
} from "../agent-sessions/index.js";

export interface AiChatSearchFilters {
  agent_id?: string | null;
  from?: string | null;
  role?: "assistant" | "system" | "user" | null;
  route_key?: string | null;
  status?: AgentSessionStatus | null;
  tenant_id: string;
  thread_id?: string | null;
  to?: string | null;
  user_id: string;
  workspace_key?: string | null;
}

export interface AiChatSearchDocument extends SearchDocument {
  agent_id: string;
  document_type: "message" | "session";
  role?: "assistant" | "system" | "user" | null;
  route_context: Record<string, unknown>;
  session_status: AgentSessionStatus;
  source_created_at: string | null;
  source_updated_at: string;
  thread_id: string;
  user_id: string;
  workspace_key: string | null;
}

export interface AiChatSearchHit {
  agent_id: string;
  chunk_id: string;
  chunk_text: string;
  doc_id: string;
  document_type: "message" | "session";
  metadata: Record<string, unknown>;
  role: "assistant" | "system" | "user" | null;
  route_context: Record<string, unknown>;
  run_id: null;
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

export interface AiChatSearchCandidate
  extends SearchCandidate<AiChatSearchHit> {
  source_scores: SearchSourceScores;
}

export interface AiChatSearchIndexStatus {
  chunk_count: number;
  document_count: number;
  indexed_session_count: number;
  last_indexed_at: string | null;
  missing_session_count: number;
  total_sessions: number;
}

export interface AiChatSearchBackfillResult {
  failed: number;
  processed: number;
  results: Array<{
    document_count?: number;
    error?: string;
    ok: boolean;
    thread_id: string;
  }>;
}

// Conforms to `SearchIndexProvider` so apps/ai callers can treat chat-search
// as a registered search index (see `@engenty/search-index`). `id`, `version`,
// and `capabilities` are required by the unified contract; `refreshSession`
// stays as a chat-search–specific helper for the session-refresh hook in app.ts.
export interface AiChatSearchStore
  extends SearchIndexProvider<
    AiChatSearchDocument,
    AiChatSearchFilters,
    AiChatSearchHit
  > {
  backfill(input: {
    limit?: number;
    tenant_id: string;
    user_id: string;
  }): Promise<AiChatSearchBackfillResult>;
  readonly capabilities: { hybrid: true; lexical: true; semantic: true };
  deleteDocument(input: { doc_id: string; tenant_id: string }): Promise<void>;
  getDocumentById(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<AiChatSearchDocument | null>;
  getIndexStatus(input: {
    tenant_id: string;
    user_id: string;
  }): Promise<AiChatSearchIndexStatus>;
  getSessionForUser(input: {
    thread_id: string;
    tenant_id: string;
    user_id: string;
  }): Promise<AgentSessionRow | null>;
  readonly id: "ai_chat_search";
  refreshSession(input: {
    thread_id: string;
    tenant_id: string;
    user_id: string;
  }): Promise<AiChatSearchDocument[]>;
  replaceDocument(input: {
    document: AiChatSearchDocument;
    force?: boolean;
  }): Promise<void>;
  search(
    input: SearchRequest<AiChatSearchFilters>
  ): Promise<SearchResponse<AiChatSearchHit>>;
  readonly version: "1";
}

// Stable provider id for `engenty.server.registerSearchIndexProvider` and
// `apps/ai`'s internal `SearchIndexRegistry`.
export const AI_CHAT_SEARCH_PROVIDER_ID = "ai_chat_search";

export type SearchableAgentSessionMessageRow = AgentSessionMessageRow & {
  role: Exclude<SessionMessageRole, "tool">;
};
