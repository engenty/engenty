// `inbox.message` SearchIndexProvider.
//
// Hybrid v2 (lexical v1 was FTS-only over the base table):
//
//   - `search()` runs the `module_inbox.search_messages` RPC, which fuses
//     weighted FTS with cosine similarity over the optional per-message
//     embedding. Explicit `strategy: "lexical"` skips the embedder entirely,
//     so hot quick-search paths never pay for a vector round-trip.
//
//   - `replaceDocument()` upserts the per-message embedding row from the
//     canonical document text (`buildMessageSearchDocument`). Empty text
//     deletes the row. `getDocumentById()` rebuilds the document so the SDK's
//     declarative re-index binding can `replace` from `inbox.message.synced`
//     events without the sync path embedding inline.
//
//   - `backfill()` embeds missing/stale messages in batches (`embedMany`
//     under the hood) — initial index build over a synced mailbox should not
//     pay one API call per message.
//
// Visibility: the host injects the authenticated `filters.tenant_id` and
// `filters.user_id` (spoofed values are stripped); the RPC applies
// `owner_user_id is null or owner_user_id = user_id` so personal-connection
// messages never leak into org-wide results — from the FIRST index version.
// The embedding rows denormalize `owner_user_id` for the same reason.

import {
  defineEmbedder,
  embedTexts,
  type SearchDocument,
  type SearchIndexProvider,
  type SearchIndexStatus,
  type SearchProviderCapabilities,
  type SearchRequest,
  type SearchResponse,
  type SearchResult,
  type SearchStrategy,
} from "@engenty/search-index";
import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embed, embedMany } from "ai";
import type { InboxMessage, InboxMessageStatus } from "../schema/types.js";
import {
  buildMessageSearchDocument,
  DEFAULT_INBOX_EMBEDDING_MODEL,
} from "../services/message-embed.js";
import { rowToMessage } from "./inbox-mappers.js";

const SCHEMA = "module_inbox";
const MESSAGES_TABLE = "messages";
const EMBEDDINGS_TABLE = "message_embeddings";
const INBOX_EMBEDDING_VECTOR_DIM = 1536;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
// Email cosine scores run lower than short-document scores (contacts uses
// 0.72 for names): a question vs. a full message body rarely clears 0.7.
const MIN_VECTOR_SCORE = 0.62;
const DEFAULT_BACKFILL_LIMIT = 100;
const MAX_BACKFILL = 500;
const MAX_STATUS_SCAN = 5000;

const logger = createLogger({ name: "inbox-search-index" });

export interface InboxSearchFilters {
  connection_id?: string;
  scope_id?: string | null;
  status?: InboxMessageStatus;
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface InboxSearchSourceScores {
  fts: number;
  vector: number;
}

export interface InboxSearchMatch {
  match_reason: "filtered" | "semantic" | "text";
  matched_fields: string[];
  message: InboxMessage;
  score: number;
  source_scores: InboxSearchSourceScores;
}

export type InboxSearchProvider = SearchIndexProvider<
  SearchDocument,
  InboxSearchFilters,
  InboxSearchMatch
>;

export interface CreateInboxSearchIndexProviderOptions {
  embeddingModelId?: string;
  supabase: SupabaseClient;
}

interface RawSearchMatch {
  id: string;
  match_reason?: unknown;
  matched_fields?: unknown;
  score?: unknown;
  source_scores?: unknown;
  thread_id?: unknown;
}

const CAPABILITIES: SearchProviderCapabilities = {
  hybrid: true,
  lexical: true,
  semantic: true,
};

function buildInboxEmbedder(modelId: string) {
  const lower = modelId.toLowerCase();
  // The AI SDK's `providerOptions` is typed as `Record<string, JSONObject>`
  // (no `undefined` allowed in index values). We carry the cast at the
  // declaration site and then forward it as `unknown` so the SDK's stricter
  // overload still accepts it.
  const providerOptions: Record<string, Record<string, unknown>> | undefined =
    lower.startsWith("google/")
      ? { google: { outputDimensionality: INBOX_EMBEDDING_VECTOR_DIM } }
      : lower === "openai/text-embedding-3-large"
        ? { openai: { dimensions: INBOX_EMBEDDING_VECTOR_DIM } }
        : undefined;
  return defineEmbedder(
    async (texts) => {
      if (texts.length === 1) {
        const single = await embed({
          model: modelId,
          value: texts[0] ?? "",
          ...(providerOptions
            ? { providerOptions: providerOptions as never }
            : {}),
        });
        return [Array.from(single.embedding as readonly number[]) as number[]];
      }
      const result = await embedMany({
        maxParallelCalls: 4,
        model: modelId,
        values: texts,
        ...(providerOptions
          ? { providerOptions: providerOptions as never }
          : {}),
      });
      return result.embeddings.map(
        (raw) => Array.from(raw as readonly number[]) as number[]
      );
    },
    {
      batch: true,
      dimensions: INBOX_EMBEDDING_VECTOR_DIM,
      maxBatchSize: 64,
      modelId,
    }
  );
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

function readSourceScores(raw: unknown): InboxSearchSourceScores {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    fts: Number(obj.fts ?? 0),
    vector: Number(obj.vector ?? 0),
  };
}

function readMatchReason(raw: unknown): InboxSearchMatch["match_reason"] {
  return raw === "semantic" || raw === "text" ? raw : "filtered";
}

function clampLimit(limit: number | undefined, max: number, def: number) {
  return Math.min(Math.max(limit ?? def, 1), max);
}

export function createInboxSearchIndexProvider(
  options: CreateInboxSearchIndexProviderOptions
): InboxSearchProvider {
  const { supabase } = options;
  const embeddingModelId =
    options.embeddingModelId?.trim() || DEFAULT_INBOX_EMBEDDING_MODEL;
  const embedder = buildInboxEmbedder(embeddingModelId);

  const messages = () => supabase.schema(SCHEMA).from(MESSAGES_TABLE);
  const embeddings = () => supabase.schema(SCHEMA).from(EMBEDDINGS_TABLE);

  async function loadMessagesByIds(
    ids: string[],
    tenantId: string
  ): Promise<Map<string, InboxMessage>> {
    if (ids.length === 0) {
      return new Map();
    }
    const { data, error } = await messages()
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) {
      throw new Error(`inbox search load failed: ${error.message}`);
    }
    return new Map(
      (data ?? []).map((row) => [
        String((row as { id: string }).id),
        rowToMessage(row as Record<string, unknown>),
      ])
    );
  }

  async function search(
    request: SearchRequest<InboxSearchFilters>
  ): Promise<SearchResponse<InboxSearchMatch>> {
    const filters = request.filters ?? {};
    const tenantId = filters.tenant_id?.trim();
    if (!tenantId) {
      return { results: [], total: 0 };
    }
    const scopeId = filters.scope_id?.trim() || "default";
    const limit = clampLimit(request.limit, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const query = (request.query ?? "").trim();
    const strategy: SearchStrategy = request.strategy ?? "hybrid";

    let queryEmbedding: number[] | null = null;
    // Explicit lexical → never pay for embeddings even when vectors exist.
    if (query.length > 0 && strategy !== "lexical") {
      try {
        const [vector] = await embedTexts(embedder, [query]);
        queryEmbedding = vector ?? null;
      } catch (err) {
        logger.warn("inbox query embedding failed; falling back to lexical", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("search_messages", {
        p_connection_id: filters.connection_id ?? null,
        p_limit: limit,
        p_offset: Math.max(request.offset ?? 0, 0),
        p_query: query,
        p_query_embedding: queryEmbedding
          ? JSON.stringify(queryEmbedding)
          : null,
        p_scope_id: scopeId,
        p_status: filters.status ?? null,
        p_tenant_id: tenantId,
        p_user_id: filters.user_id ?? null,
        p_vector_threshold: MIN_VECTOR_SCORE,
      });
    if (error) {
      throw new Error(`inbox search failed: ${error.message}`);
    }
    const payload = (data ?? {}) as {
      matches?: RawSearchMatch[];
      total?: number;
    };
    const matches = payload.matches ?? [];
    if (matches.length === 0) {
      return { results: [], total: Number(payload.total ?? 0) };
    }
    const byId = await loadMessagesByIds(
      matches.map((match) => String(match.id)),
      tenantId
    );
    const results: SearchResult<InboxSearchMatch>[] = [];
    for (const match of matches) {
      const message = byId.get(String(match.id));
      if (!message) {
        continue;
      }
      const matchedFields = asStringArray(match.matched_fields);
      const sourceScores = readSourceScores(match.source_scores);
      const score = Number(match.score ?? 0);
      results.push({
        item: {
          match_reason: readMatchReason(match.match_reason),
          matched_fields: matchedFields,
          message,
          score,
          source_scores: sourceScores,
        },
        matched_fields: matchedFields,
        score,
        // `InboxSearchSourceScores` is a strict named record; the search
        // contract accepts an open `{ [source: string]: number | undefined }`
        // — both shapes describe the same data so we forward through.
        source_scores: { ...sourceScores },
      });
    }
    return { results, total: Number(payload.total ?? results.length) };
  }

  function toSearchDocument(message: InboxMessage): SearchDocument {
    return {
      doc_id: message.id,
      // Carried into the embedding row so RLS keeps personal-connection
      // vectors owner-only, mirroring `module_inbox.messages`.
      metadata: { owner_user_id: message.owner_user_id },
      scope_id: message.scope_id,
      source_id: message.id,
      source_type: "inbox.message",
      tenant_id: message.tenant_id,
      text: buildMessageSearchDocument(message),
    };
  }

  async function getDocumentById(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<SearchDocument | null> {
    const tenantId = input.tenant_id.trim();
    const messageId = input.doc_id.trim();
    if (!(tenantId && messageId)) {
      return null;
    }
    const found = await loadMessagesByIds([messageId], tenantId);
    const message = found.get(messageId);
    return message ? toSearchDocument(message) : null;
  }

  async function deleteDocument(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<void> {
    const tenantId = input.tenant_id.trim();
    const messageId = input.doc_id.trim();
    if (!(tenantId && messageId)) {
      return;
    }
    const { error } = await embeddings()
      .delete()
      .eq("tenant_id", tenantId)
      .eq("message_id", messageId);
    if (error) {
      throw new Error(`Failed to delete inbox embedding: ${error.message}`);
    }
  }

  function embeddingRow(document: SearchDocument, embedding: number[]) {
    const owner = document.metadata?.owner_user_id;
    return {
      document_text: document.text,
      embedding,
      embedding_model: embedder.modelId,
      message_id: document.doc_id,
      owner_user_id: typeof owner === "string" && owner ? owner : null,
      scope_id: document.scope_id ?? "default",
      tenant_id: document.tenant_id,
      updated_at: new Date().toISOString(),
    };
  }

  async function replaceDocument(input: {
    document: SearchDocument;
  }): Promise<void> {
    const { document } = input;
    const tenantId = document.tenant_id?.trim();
    const messageId = document.doc_id?.trim();
    if (!(tenantId && messageId)) {
      return;
    }
    if (!document.text?.trim()) {
      await deleteDocument({ doc_id: messageId, tenant_id: tenantId });
      return;
    }
    const [embedding] = await embedTexts(embedder, [document.text]);
    if (!embedding) {
      throw new Error("Embedder returned no vectors for inbox message");
    }
    const { error } = await embeddings().upsert(
      embeddingRow(document, embedding),
      { onConflict: "message_id" }
    );
    if (error) {
      throw new Error(`Failed to upsert inbox embedding: ${error.message}`);
    }
  }

  // Messages are immutable after sync (status changes don't touch the
  // document text), so "stale" only means the embedding predates the row —
  // e.g. a document-builder change re-indexed via `backfill({ force })`.
  async function loadIndexState(tenantId: string, limit: number) {
    const { data: messageRows } = await messages()
      .select("id, updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const messageRowsArr = (messageRows ?? []) as {
      id: string;
      updated_at: string;
    }[];
    const ids = messageRowsArr.map((row) => String(row.id));
    const { data: indexRows } = await embeddings()
      .select("message_id, updated_at")
      .eq("tenant_id", tenantId)
      .in("message_id", ids.length === 0 ? [""] : ids);
    const indexedAt = new Map<string, string>();
    for (const row of indexRows ?? []) {
      indexedAt.set(
        String((row as { message_id: string }).message_id),
        String((row as { updated_at: string }).updated_at)
      );
    }
    return { indexedAt, messageRowsArr };
  }

  async function getStatus(input?: {
    tenant_id?: string | null;
    user_id?: string | null;
  }): Promise<SearchIndexStatus> {
    const tenantId = input?.tenant_id?.trim();
    if (!tenantId) {
      return {
        current_count: 0,
        indexed_count: 0,
        last_indexed_at: null,
        missing_count: 0,
        stale_count: 0,
        total_count: 0,
      };
    }
    const { indexedAt, messageRowsArr } = await loadIndexState(
      tenantId,
      MAX_STATUS_SCAN
    );
    let current = 0;
    let stale = 0;
    let missing = 0;
    for (const row of messageRowsArr) {
      const last = indexedAt.get(String(row.id));
      if (!last) {
        missing++;
      } else if (
        new Date(last).getTime() < new Date(String(row.updated_at)).getTime()
      ) {
        stale++;
      } else {
        current++;
      }
    }
    const lastIndexed = Array.from(indexedAt.values()).toSorted((a, b) =>
      b.localeCompare(a)
    )[0];
    return {
      current_count: current,
      indexed_count: indexedAt.size,
      last_indexed_at: lastIndexed ?? null,
      missing_count: missing,
      stale_count: stale,
      total_count: messageRowsArr.length,
    };
  }

  async function backfill(input?: {
    force?: boolean;
    limit?: number;
    tenant_id?: string | null;
    user_id?: string | null;
  }): Promise<{
    failed: number;
    processed: number;
    results: { error?: string; message_id: string; ok: boolean }[];
  }> {
    const tenantId = input?.tenant_id?.trim();
    if (!tenantId) {
      return { failed: 0, processed: 0, results: [] };
    }
    const limit = clampLimit(
      input?.limit,
      MAX_BACKFILL,
      DEFAULT_BACKFILL_LIMIT
    );
    // Scan wide, work narrow: the missing/stale filter runs over the full
    // status window so repeated calls advance past the newest `limit`
    // messages instead of re-checking the same window forever.
    const { indexedAt, messageRowsArr } = await loadIndexState(
      tenantId,
      MAX_STATUS_SCAN
    );
    const targetIds = messageRowsArr
      .filter((row) => {
        if (input?.force) {
          return true;
        }
        const last = indexedAt.get(String(row.id));
        if (!last) {
          return true;
        }
        return (
          new Date(last).getTime() < new Date(String(row.updated_at)).getTime()
        );
      })
      .map((row) => String(row.id))
      .slice(0, limit);
    if (targetIds.length === 0) {
      return { failed: 0, processed: 0, results: [] };
    }
    const byId = await loadMessagesByIds(targetIds, tenantId);
    const documents: SearchDocument[] = [];
    const results: { error?: string; message_id: string; ok: boolean }[] = [];
    for (const id of targetIds) {
      const message = byId.get(id);
      if (!message) {
        // Row disappeared between the scans; the FK cascade already removed
        // any embedding.
        continue;
      }
      const document = toSearchDocument(message);
      if (document.text.trim()) {
        documents.push(document);
      } else {
        try {
          await deleteDocument({ doc_id: id, tenant_id: tenantId });
          results.push({ message_id: id, ok: true });
        } catch (err) {
          results.push({
            error: err instanceof Error ? err.message : String(err),
            message_id: id,
            ok: false,
          });
        }
      }
    }
    // Batched embedding (embedMany under the hood) — one call per
    // `maxBatchSize` documents instead of one per message.
    if (documents.length > 0) {
      try {
        const vectors = await embedTexts(
          embedder,
          documents.map((document) => document.text)
        );
        const rows = documents.map((document, index) =>
          embeddingRow(document, vectors[index] ?? [])
        );
        const { error } = await embeddings().upsert(rows, {
          onConflict: "message_id",
        });
        if (error) {
          throw new Error(error.message);
        }
        for (const document of documents) {
          results.push({ message_id: document.doc_id, ok: true });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const document of documents) {
          results.push({
            error: message,
            message_id: document.doc_id,
            ok: false,
          });
        }
      }
    }
    return {
      failed: results.filter((r) => !r.ok).length,
      processed: results.length,
      results,
    };
  }

  return {
    backfill,
    capabilities: CAPABILITIES,
    deleteDocument,
    getDocumentById,
    getStatus,
    id: "inbox.message",
    replaceDocument,
    search,
    version: "2",
  };
}
