import {
  normalizeSearchLimit,
  normalizeSearchOffset,
  type SearchResponse,
  type SearchStrategy,
} from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentSessionMessageRow,
  AgentSessionRow,
} from "../agent-sessions/index.js";
import { buildAiChatSearchDocumentsForSession } from "./documents.js";
import type {
  AiChatSearchBackfillResult,
  AiChatSearchCandidate,
  AiChatSearchDocument,
  AiChatSearchFilters,
  AiChatSearchHit,
} from "./types.js";

const AI_SCHEMA = "ai";
const DOCUMENTS_TABLE = "agent_chat_search_document";
const CHUNKS_TABLE = "agent_chat_search_chunk";
const MAX_BACKFILL_LIMIT = 200;
const MAX_DOCUMENT_CANDIDATES = 500;
// PostgREST encodes `.in(...)` filters into the request URL (GET). Sending all
// candidate doc_ids at once overflows the gateway URL limit (HTTP 414 "URI too
// long"), so we page `doc_id` lookups in small batches and merge in memory.
const CHUNK_DOC_ID_BATCH = 50;

interface AiChatSearchDocumentRow {
  agent_id: string;
  doc_id: string;
  document_type: "message" | "session";
  indexed_at: string;
  metadata: Record<string, unknown>;
  role: "assistant" | "system" | "user" | null;
  route_context: Record<string, unknown>;
  session_status: "completed" | "failed" | "idle" | "running" | "waiting";
  source_created_at: string | null;
  source_id: string;
  source_updated_at: string;
  tenant_id: string;
  text: string;
  thread_id: string;
  user_id: string;
  workspace_key: string | null;
}

interface AiChatSearchChunkRow {
  chunk_id: string;
  chunk_index: number;
  doc_id: string;
  indexed_at: string;
  metadata: Record<string, unknown>;
  tenant_id: string;
  text: string;
  thread_id: string;
  user_id: string;
}

function asCount(value: number | null | undefined): number {
  return Number.isFinite(value ?? Number.NaN) ? (value ?? 0) : 0;
}

function clampBackfillLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? MAX_BACKFILL_LIMIT, 1), MAX_BACKFILL_LIMIT);
}

function asJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toDocumentRow(document: AiChatSearchDocument) {
  return {
    agent_id: document.agent_id,
    doc_id: document.doc_id,
    document_type: document.document_type,
    indexed_at: new Date().toISOString(),
    metadata: document.metadata ?? {},
    role: document.role ?? null,
    route_context: document.route_context,
    thread_id: document.thread_id,
    session_status: document.session_status,
    source_created_at: document.source_created_at,
    source_id: document.source_id,
    source_updated_at: document.source_updated_at,
    tenant_id: document.tenant_id,
    text: document.text,
    user_id: document.user_id,
    workspace_key: document.workspace_key,
  };
}

function toCandidate(params: {
  chunk: AiChatSearchChunkRow;
  document: AiChatSearchDocumentRow;
  query: string;
  strategy: SearchStrategy;
}): AiChatSearchCandidate | null {
  const query = params.query.trim().toLowerCase();
  const chunkText = params.chunk.text;
  const textLower = chunkText.toLowerCase();
  const recency = recencyScore(params.document.source_updated_at);
  const fts = query && textLower.includes(query) ? 1 : 0;
  const trigram = query ? tokenOverlapScore(query, textLower) : 0;
  const queryScore =
    query.length === 0
      ? 0
      : params.strategy === "semantic"
        ? Math.max(fts, trigram)
        : fts * 2 + trigram;
  if (query && queryScore <= 0) {
    return null;
  }
  const score = queryScore + recency * 0.05;
  const sourceScores = {
    fts,
    recency,
    semantic: 0,
    trigram,
  };
  return {
    doc_id: params.document.doc_id,
    item: {
      agent_id: params.document.agent_id,
      chunk_id: params.chunk.chunk_id,
      chunk_text: chunkText,
      doc_id: params.document.doc_id,
      document_type: params.document.document_type,
      metadata: asJsonObject(params.document.metadata),
      role: params.document.role,
      route_context: asJsonObject(params.document.route_context),
      run_id: null,
      thread_id: params.document.thread_id,
      session_status: params.document.session_status,
      source_created_at: params.document.source_created_at,
      source_id: params.document.source_id,
      source_updated_at: params.document.source_updated_at,
      tenant_id: params.document.tenant_id,
      text: params.document.text,
      user_id: params.document.user_id,
      workspace_key: params.document.workspace_key,
    },
    matched_fields: matchedFields({ fts, query, trigram }),
    score,
    source_scores: sourceScores,
  };
}

function matchedFields(input: {
  fts: number;
  query: string;
  trigram: number;
}): string[] {
  if (!input.query) {
    return [];
  }
  return [
    ...(input.fts > 0 ? ["text"] : []),
    ...(input.trigram > 0 ? ["fuzzy"] : []),
  ];
}

function recencyScore(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }
  const ageDays = Math.max(0, Date.now() - timestamp) / 86_400_000;
  return 1 / (1 + ageDays);
}

function tokenOverlapScore(query: string, text: string): number {
  const tokens = query.split(/\s+/).filter((token) => token.length > 1);
  if (tokens.length === 0) {
    return 0;
  }
  const hits = tokens.filter((token) => text.includes(token)).length;
  return hits / tokens.length;
}

function bestChunkPerDocument(candidates: AiChatSearchCandidate[]) {
  const best = new Map<string, AiChatSearchCandidate>();
  for (const candidate of candidates) {
    const existing = best.get(candidate.doc_id);
    if (!existing || candidate.score > existing.score) {
      best.set(candidate.doc_id, candidate);
    }
  }
  return [...best.values()];
}

export function createAiChatSearchStore(client: SupabaseClient) {
  const db = client.schema(AI_SCHEMA);
  const documentsTable = () => db.from(DOCUMENTS_TABLE);
  const chunksTable = () => db.from(CHUNKS_TABLE);

  async function deleteSessionDocuments(input: {
    thread_id: string;
    tenant_id: string;
  }): Promise<void> {
    const { error } = await documentsTable()
      .delete()
      .eq("tenant_id", input.tenant_id)
      .eq("thread_id", input.thread_id);
    if (error) {
      throw new Error(`agent_chat_search_document delete: ${error.message}`);
    }
  }

  async function replaceDocument(
    document: AiChatSearchDocument
  ): Promise<void> {
    const { error: chunkDeleteError } = await chunksTable()
      .delete()
      .eq("tenant_id", document.tenant_id)
      .eq("doc_id", document.doc_id);
    if (chunkDeleteError) {
      throw new Error(
        `agent_chat_search_chunk delete: ${chunkDeleteError.message}`
      );
    }
    if (!document.text.trim()) {
      const { error } = await documentsTable()
        .delete()
        .eq("tenant_id", document.tenant_id)
        .eq("doc_id", document.doc_id);
      if (error) {
        throw new Error(`agent_chat_search_document delete: ${error.message}`);
      }
      return;
    }
    const { error: documentError } = await documentsTable().upsert(
      toDocumentRow(document),
      { onConflict: "doc_id" }
    );
    if (documentError) {
      throw new Error(
        `agent_chat_search_document upsert: ${documentError.message}`
      );
    }
    const chunks = document.chunks ?? [];
    if (chunks.length === 0) {
      return;
    }
    const { error: chunkInsertError } = await chunksTable().insert(
      chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id,
        chunk_index: chunk.chunk_index,
        doc_id: document.doc_id,
        indexed_at: new Date().toISOString(),
        metadata: chunk.metadata ?? {},
        thread_id: document.thread_id,
        tenant_id: document.tenant_id,
        text: chunk.text,
        user_id: document.user_id,
      }))
    );
    if (chunkInsertError) {
      throw new Error(
        `agent_chat_search_chunk insert: ${chunkInsertError.message}`
      );
    }
  }

  // Fetch chunks for the candidate documents in small `doc_id` batches so the
  // PostgREST `.in(...)` URL never exceeds the gateway limit (HTTP 414).
  async function fetchChunksForDocIds(input: {
    docIds: string[];
    limit: number;
    tenant_id: string;
  }): Promise<AiChatSearchChunkRow[]> {
    const rows: AiChatSearchChunkRow[] = [];
    for (
      let start = 0;
      start < input.docIds.length && rows.length < input.limit;
      start += CHUNK_DOC_ID_BATCH
    ) {
      const batch = input.docIds.slice(start, start + CHUNK_DOC_ID_BATCH);
      const { data, error } = await chunksTable()
        .select()
        .eq("tenant_id", input.tenant_id)
        .in("doc_id", batch)
        .order("chunk_index", { ascending: true })
        .limit(input.limit - rows.length);
      if (error) {
        throw new Error(`agent_chat_search_chunk search: ${error.message}`);
      }
      rows.push(...((data ?? []) as AiChatSearchChunkRow[]));
    }
    return rows;
  }

  // Per-doc delete used by the unified `SearchIndexProvider` contract.
  async function deleteDocumentByDocId(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<void> {
    const { error: chunkError } = await chunksTable()
      .delete()
      .eq("tenant_id", input.tenant_id)
      .eq("doc_id", input.doc_id);
    if (chunkError) {
      throw new Error(`agent_chat_search_chunk delete: ${chunkError.message}`);
    }
    const { error } = await documentsTable()
      .delete()
      .eq("tenant_id", input.tenant_id)
      .eq("doc_id", input.doc_id);
    if (error) {
      throw new Error(`agent_chat_search_document delete: ${error.message}`);
    }
  }

  return {
    id: "ai_chat_search" as const,
    capabilities: {
      hybrid: true as const,
      lexical: true as const,
      semantic: true as const,
    },
    version: "1" as const,

    async backfill(input: {
      limit?: number;
      tenant_id: string;
      user_id: string;
    }): Promise<AiChatSearchBackfillResult> {
      const limit = clampBackfillLimit(input.limit);
      const sessions = await this.listSessionsForUser({
        limit,
        tenant_id: input.tenant_id,
        user_id: input.user_id,
      });
      const results: AiChatSearchBackfillResult["results"] = [];
      for (const session of sessions) {
        try {
          const documents = await this.refreshSession({
            thread_id: session.id,
            tenant_id: input.tenant_id,
            user_id: input.user_id,
          });
          results.push({
            document_count: documents.length,
            ok: true,
            thread_id: session.id,
          });
        } catch (error) {
          results.push({
            error: error instanceof Error ? error.message : "Unknown error",
            ok: false,
            thread_id: session.id,
          });
        }
      }
      return {
        failed: results.filter((result) => !result.ok).length,
        processed: results.length,
        results,
      };
    },

    async getStatus(input?: {
      tenant_id?: string | null;
      user_id?: string | null;
    }) {
      // Unified `SearchIndexProvider.getStatus` shape. Defers to
      // `getIndexStatus` for the actual count math and remaps fields. Bare
      // operator calls (no tenant/user) yield zeros — chat-search documents
      // are user-scoped so listing without filters is meaningless.
      if (!(input?.tenant_id && input?.user_id)) {
        return {
          current_count: 0,
          indexed_count: 0,
          last_indexed_at: null,
          missing_count: 0,
          stale_count: 0,
          total_count: 0,
        };
      }
      const status = await this.getIndexStatus({
        tenant_id: input.tenant_id,
        user_id: input.user_id,
      });
      return {
        current_count: status.indexed_session_count,
        indexed_count: status.indexed_session_count,
        last_indexed_at: status.last_indexed_at,
        missing_count: status.missing_session_count,
        stale_count: 0,
        total_count: status.total_sessions,
      };
    },

    async getIndexStatus(input: { tenant_id: string; user_id: string }) {
      const sessionCount = await documentsCount(async () =>
        db
          .from("thread")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", input.tenant_id)
          .eq("created_by_user_id", input.user_id)
      );
      const documentCount = await documentsCount(async () =>
        documentsTable()
          .select("doc_id", { count: "exact", head: true })
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.user_id)
      );
      const chunkCount = await documentsCount(async () =>
        chunksTable()
          .select("chunk_id", { count: "exact", head: true })
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.user_id)
      );
      const { data: indexedSessions, error: indexedError } =
        await documentsTable()
          .select("thread_id,indexed_at")
          .eq("tenant_id", input.tenant_id)
          .eq("user_id", input.user_id)
          .order("indexed_at", { ascending: false })
          .limit(10_000);
      if (indexedError) {
        throw new Error(
          `agent_chat_search_document status: ${indexedError.message}`
        );
      }
      const threadIds = new Set(
        ((indexedSessions ?? []) as Array<{ thread_id: string }>).map(
          (row) => row.thread_id
        )
      );
      const lastIndexedAt =
        ((indexedSessions ?? [])[0] as { indexed_at?: string } | undefined)
          ?.indexed_at ?? null;
      return {
        chunk_count: chunkCount,
        document_count: documentCount,
        indexed_session_count: threadIds.size,
        last_indexed_at: lastIndexedAt,
        missing_session_count: Math.max(0, sessionCount - threadIds.size),
        total_sessions: sessionCount,
      };
    },

    async getSessionForUser(input: {
      thread_id: string;
      tenant_id: string;
      user_id: string;
    }): Promise<AgentSessionRow | null> {
      const { data, error } = await db
        .from("thread")
        .select()
        .eq("tenant_id", input.tenant_id)
        .eq("id", input.thread_id)
        .eq("created_by_user_id", input.user_id)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_session select: ${error.message}`);
      }
      return (data as AgentSessionRow | null) ?? null;
    },

    async listSessionsForUser(input: {
      limit: number;
      tenant_id: string;
      user_id: string;
    }): Promise<AgentSessionRow[]> {
      const { data, error } = await db
        .from("thread")
        .select()
        .eq("tenant_id", input.tenant_id)
        .eq("created_by_user_id", input.user_id)
        .order("updated_at", { ascending: false })
        .limit(input.limit);
      if (error) {
        throw new Error(`agent_session list: ${error.message}`);
      }
      return (data as AgentSessionRow[]) ?? [];
    },

    async deleteDocument(input: {
      doc_id: string;
      tenant_id: string;
    }): Promise<void> {
      await deleteDocumentByDocId(input);
    },

    async getDocumentById(input: {
      doc_id: string;
      tenant_id: string;
    }): Promise<AiChatSearchDocument | null> {
      const { data, error } = await documentsTable()
        .select()
        .eq("tenant_id", input.tenant_id)
        .eq("doc_id", input.doc_id)
        .maybeSingle();
      if (error) {
        throw new Error(`agent_chat_search_document get: ${error.message}`);
      }
      const row = data as AiChatSearchDocumentRow | null;
      if (!row) {
        return null;
      }
      return {
        agent_id: row.agent_id,
        doc_id: row.doc_id,
        document_type: row.document_type,
        metadata: asJsonObject(row.metadata),
        role: row.role,
        route_context: asJsonObject(row.route_context),
        thread_id: row.thread_id,
        session_status: row.session_status,
        source_created_at: row.source_created_at,
        source_id: row.source_id,
        source_type: row.document_type,
        source_updated_at: row.source_updated_at,
        tenant_id: row.tenant_id,
        text: row.text,
        user_id: row.user_id,
        workspace_key: row.workspace_key,
      };
    },

    async replaceDocument(input: {
      document: AiChatSearchDocument;
      force?: boolean;
    }): Promise<void> {
      await replaceDocument(input.document);
    },

    async refreshSession(input: {
      thread_id: string;
      tenant_id: string;
      user_id: string;
    }): Promise<AiChatSearchDocument[]> {
      const session = await this.getSessionForUser(input);
      if (!session) {
        await deleteSessionDocuments(input);
        return [];
      }
      const { data, error } = await db
        .from("thread_message")
        .select()
        .eq("tenant_id", input.tenant_id)
        .eq("thread_id", input.thread_id)
        .order("id", { ascending: true })
        .limit(500);
      if (error) {
        throw new Error(`thread_message list: ${error.message}`);
      }
      const documents = buildAiChatSearchDocumentsForSession(
        session,
        (data as AgentSessionMessageRow[]) ?? []
      );
      await deleteSessionDocuments(input);
      for (const document of documents) {
        await replaceDocument(document);
      }
      return documents;
    },

    async search(input: {
      filters?: AiChatSearchFilters;
      limit: number;
      offset?: number;
      query?: string;
      strategy?: SearchStrategy;
    }): Promise<SearchResponse<AiChatSearchHit>> {
      const filters = input.filters;
      if (!(filters?.tenant_id && filters.user_id)) {
        throw new Error("tenant_id and user_id are required for chat search");
      }
      let q = documentsTable()
        .select()
        .eq("tenant_id", filters.tenant_id)
        .eq("user_id", filters.user_id)
        .order("source_updated_at", { ascending: false })
        .limit(MAX_DOCUMENT_CANDIDATES);
      if (filters.agent_id) {
        q = q.eq("agent_id", filters.agent_id);
      }
      if (filters.thread_id) {
        q = q.eq("thread_id", filters.thread_id);
      }
      if (filters.workspace_key) {
        q = q.eq("workspace_key", filters.workspace_key);
      }
      if (filters.role) {
        q = q.eq("role", filters.role);
      }
      if (filters.status) {
        q = q.eq("session_status", filters.status);
      }
      if (filters.route_key) {
        q = q.eq("route_context->>routeKey", filters.route_key);
      }
      if (filters.from) {
        q = q.gte("source_updated_at", filters.from);
      }
      if (filters.to) {
        q = q.lte("source_updated_at", filters.to);
      }
      const { data: documents, error: documentError } = await q;
      if (documentError) {
        throw new Error(
          `agent_chat_search_document search: ${documentError.message}`
        );
      }
      const documentRows = (
        (documents ?? []) as AiChatSearchDocumentRow[]
      ).filter((row) => row.doc_id);
      if (documentRows.length === 0) {
        return { results: [], total: 0 };
      }
      const docsById = new Map(documentRows.map((row) => [row.doc_id, row]));
      const chunks = await fetchChunksForDocIds({
        docIds: [...docsById.keys()],
        limit: MAX_DOCUMENT_CANDIDATES * 4,
        tenant_id: filters.tenant_id,
      });
      const query = input.query ?? "";
      const strategy = input.strategy ?? "hybrid";
      const candidates = chunks
        .map((chunk) => {
          const document = docsById.get(chunk.doc_id);
          return document
            ? toCandidate({ chunk, document, query, strategy })
            : null;
        })
        .filter(
          (candidate): candidate is AiChatSearchCandidate => candidate != null
        );
      const ranked = bestChunkPerDocument(candidates).toSorted(
        (left, right) =>
          right.score - left.score ||
          right.item.source_updated_at.localeCompare(
            left.item.source_updated_at
          ) ||
          left.doc_id.localeCompare(right.doc_id)
      );
      const limit = normalizeSearchLimit(input.limit);
      const offset = normalizeSearchOffset(input.offset);
      return {
        results: ranked.slice(offset, offset + limit),
        total: ranked.length,
      };
    },
  };
}

async function documentsCount(
  run: () => PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>
) {
  const { count, error } = await run();
  if (error) {
    throw new Error(`chat search count failed: ${error.message}`);
  }
  return asCount(count);
}

export type SupabaseAiChatSearchStore = ReturnType<
  typeof createAiChatSearchStore
>;
