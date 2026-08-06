// `ai.chat_session` retrieval source (retrieval-service Phase 5a — replaces
// the hand-rolled chat-search store + ai.agent_chat_search_* tables).
//
// The central service owns storage (search.documents/chunks), chunking,
// embedding, the fused query, status, and backfill. This file contributes
// what is chat-specific:
//
//   - one document per session: title + summary + role-prefixed transcript
//     (buildChatSessionSearchText); doc_id = thread_id
//   - visibility "user": owner_user_id = the session creator, enforced per
//     row inside search.query_chunks — the legacy JS-side
//     `.eq("user_id", …)` filtering moves into the visibility model
//   - filter mapping (agent_id / workspace_key / status / route_key →
//     metadata pushdown; from/to → occurred range)
//   - hydration back into the legacy `AiChatSearchHit` shape so
//     engenty-copilot's `searchAgentChatSessions` parses results unchanged
//
// apps/ai runs out-of-process from apps/core, so it constructs its OWN
// `createRetrievalService` over the same database (`createChatSearchRetrieval`
// below) instead of going through core's plugin loader. The manufactured
// provider is re-exposed under the legacy registry id `ai_chat_search`.

import {
  createRetrievalService,
  type RetrievalMatch,
  type RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type {
  SearchCandidate,
  SearchIndexProvider,
  SearchResult,
} from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ThreadMessageRow, ThreadRow } from "../threads/index.js";
import { buildChatSessionSearchText } from "./documents.js";
import { AI_CHAT_SEARCH_PROVIDER_ID, type AiChatSearchHit } from "./types.js";

export const AI_CHAT_SESSION_SOURCE_TYPE = "ai.chat_session";
const AI_SCHEMA = "ai";
// Legacy refreshSession loaded at most 500 messages per session; keep that cap.
const MAX_TRANSCRIPT_MESSAGES = 500;
// Chat transcripts are long — paragraph chunks keep turns together while
// staying inside an embeddable window.
const CHUNK_MAX_LENGTH = 1200;
// Conversational text scores low cosine for question-style queries — mirrors
// the measured inbox floor (0.45); the 0.62 default hides real matches.
const MIN_VECTOR_SCORE = 0.45;
// As-you-type sidebar search stays lexical (no embedding round-trip) up to
// this many terms — the legacy provider was lexical-only, so short queries
// keep their exact latency profile.
const FAST_PATH_MAX_TERMS = 2;

function routeKeyOf(session: {
  route_context: Record<string, unknown>;
}): string | null {
  const value = session.route_context?.routeKey;
  return typeof value === "string" && value ? value : null;
}

function sessionFilterMetadata(session: {
  agent_id: string;
  route_context: Record<string, unknown>;
  status: string;
  workspace_key: string | null;
}): Record<string, string> {
  const metadata: Record<string, string> = {
    agent_id: session.agent_id,
    status: session.status,
  };
  if (session.workspace_key) {
    metadata.workspace_key = session.workspace_key;
  }
  const routeKey = routeKeyOf(session);
  if (routeKey) {
    metadata.route_key = routeKey;
  }
  return metadata;
}

export function createChatSessionRetrievalSource(options: {
  supabase: SupabaseClient;
}): RetrievalSourceRegistration<AiChatSearchHit> {
  const db = () => options.supabase.schema(AI_SCHEMA);

  async function loadSessionsByIds(
    ids: string[],
    tenantId: string
  ): Promise<Map<string, ThreadRow>> {
    if (ids.length === 0) {
      return new Map();
    }
    const { data, error } = await db()
      .from("thread")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) {
      throw new Error(`chat session load failed: ${error.message}`);
    }
    return new Map(((data ?? []) as ThreadRow[]).map((row) => [row.id, row]));
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      // Service-side rebuild: no user filter here. Per-user visibility is a
      // row property (owner_user_id), enforced by the fusion RPC at query
      // time — not by application-side filtering.
      const sessions = await loadSessionsByIds([doc_id], tenant_id);
      const session = sessions.get(doc_id);
      if (!session) {
        return null;
      }
      const { data, error } = await db()
        .from("thread_message")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("thread_id", doc_id)
        .order("id", { ascending: true })
        .limit(MAX_TRANSCRIPT_MESSAGES);
      if (error) {
        throw new Error(`chat message load failed: ${error.message}`);
      }
      const text = buildChatSessionSearchText(
        session,
        (data ?? []) as ThreadMessageRow[]
      );
      if (!text) {
        // No searchable content — ingest treats null as delete-from-index.
        return null;
      }
      return {
        doc_id,
        filter_metadata: sessionFilterMetadata(session),
        occurred_at: session.updated_at,
        owner_user_id: session.created_by_user_id,
        scope_id: null,
        source_id: doc_id,
        source_type: AI_CHAT_SESSION_SOURCE_TYPE,
        source_updated_at: session.updated_at,
        tenant_id,
        text,
        title: session.title,
      };
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await db()
        .from("thread")
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`chat session list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "ai",
    // No declarative onEvents: apps/ai's local events runtime drives ingest
    // through the explicit `ai.chat_session.updated` / `.deleted` subscribers
    // in app.ts (a session re-indexes as a whole on any persistence write).
    operation: {
      entityName: "chat_session",
      overrides: {
        idempotent: true,
        riskLevel: "low",
        summary:
          "Search the caller's chat sessions by title, summary, or transcript text (hybrid lexical + semantic)",
      },
    },
    retriever: {
      fastPath: { maxTerms: FAST_PATH_MAX_TERMS },
      hydrate: async (matches, ctx) => {
        // Legacy behavior: best chunk per session. Matches arrive fused-score
        // descending, so the first occurrence per doc wins.
        const deduped: RetrievalMatch[] = [];
        const seen = new Set<string>();
        for (const match of matches) {
          if (seen.has(match.doc_id)) {
            continue;
          }
          seen.add(match.doc_id);
          deduped.push(match);
        }
        const sessions = await loadSessionsByIds(
          deduped.map((match) => match.doc_id),
          ctx.tenant_id
        );
        const results: SearchResult<AiChatSearchHit>[] = [];
        for (const match of deduped) {
          const session = sessions.get(match.doc_id);
          if (!session) {
            continue;
          }
          const candidate: SearchCandidate<AiChatSearchHit> = {
            doc_id: match.doc_id,
            item: {
              agent_id: session.agent_id,
              chunk_id: match.chunk_id,
              chunk_text: match.text,
              doc_id: match.doc_id,
              document_type: "session",
              metadata: match.metadata,
              role: null,
              route_context: session.route_context,
              run_id: null,
              session_id: session.id,
              session_status: session.status,
              source_created_at: session.created_at,
              source_id: session.id,
              source_updated_at: session.updated_at,
              tenant_id: session.tenant_id,
              text: match.text,
              thread_id: session.id,
              user_id: session.created_by_user_id,
              workspace_key: session.workspace_key,
            },
            matched_fields: match.matched_fields,
            score: match.score,
            source_scores: { ...match.source_scores },
          };
          results.push(candidate);
        }
        return results;
      },
      mapFilters: (filters) => {
        const metadata: Record<string, string> = {};
        if (typeof filters.agent_id === "string" && filters.agent_id) {
          metadata.agent_id = filters.agent_id;
        }
        if (
          typeof filters.workspace_key === "string" &&
          filters.workspace_key
        ) {
          metadata.workspace_key = filters.workspace_key;
        }
        if (typeof filters.status === "string" && filters.status) {
          metadata.status = filters.status;
        }
        if (typeof filters.route_key === "string" && filters.route_key) {
          metadata.route_key = filters.route_key;
        }
        return {
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          occurred_after:
            typeof filters.from === "string" && filters.from
              ? filters.from
              : undefined,
          occurred_before:
            typeof filters.to === "string" && filters.to
              ? filters.to
              : undefined,
        };
      },
      vectorThreshold: MIN_VECTOR_SCORE,
    },
    source_type: AI_CHAT_SESSION_SOURCE_TYPE,
    splitter: { max_chunk_length: CHUNK_MAX_LENGTH, mode: "paragraph" },
    visibility: "user",
  };
}

/**
 * apps/ai-local retrieval assembly for chat search. Constructs a dedicated
 * `createRetrievalService` instance over the same Supabase database core
 * uses (the `search.*` schema is shared; the per-process service instances
 * are not), registers the `ai.chat_session` source, and exposes:
 *
 * - `provider`: the manufactured `SearchIndexProvider`, re-keyed to the
 *   legacy registry id `ai_chat_search` so `/ai/v1/search-index/providers/
 *   ai_chat_search/*` and the Mastra chat tools keep resolving it.
 * - `refreshSession` / `removeSession`: the event-subscriber surface app.ts
 *   wires to `ai.chat_session.updated` / `.deleted`.
 */
export interface ChatSearchRetrieval {
  provider: SearchIndexProvider<never, never, unknown>;
  refreshSession(input: {
    tenant_id: string;
    thread_id: string;
  }): Promise<void>;
  removeSession(input: { tenant_id: string; thread_id: string }): Promise<void>;
}

export function createChatSearchRetrieval(options: {
  supabase: SupabaseClient;
}): ChatSearchRetrieval {
  const service = createRetrievalService({ supabase: options.supabase });
  service.registerSource(createChatSessionRetrievalSource(options));
  const managed = service.getProvider(AI_CHAT_SESSION_SOURCE_TYPE);
  if (!managed) {
    throw new Error(
      "retrieval service did not manufacture the chat-session provider"
    );
  }
  return {
    // The manufactured provider's id is the source type; re-expose it under
    // the legacy provider id consumers resolve (methods are closures — the
    // spread does not detach them from the service).
    provider: { ...managed, id: AI_CHAT_SEARCH_PROVIDER_ID },
    refreshSession: async ({ tenant_id, thread_id }) => {
      await service.ingest({
        doc_id: thread_id,
        source_type: AI_CHAT_SESSION_SOURCE_TYPE,
        tenant_id,
      });
    },
    removeSession: async ({ tenant_id, thread_id }) => {
      await service.remove({
        doc_id: thread_id,
        source_type: AI_CHAT_SESSION_SOURCE_TYPE,
        tenant_id,
      });
    },
  };
}
