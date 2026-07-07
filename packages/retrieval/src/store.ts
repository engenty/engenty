// Write/read layer over the central `search` schema (service-role client).
// All reads used for searching flow through the fusion RPC (query.ts); this
// module owns document/chunk persistence and the status/backfill scans.

import type { SearchChunk } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RetrievalDocument, VisibilityKind } from "./contracts.js";

const SCHEMA = "search";

export interface ChunkUpsertInput {
  chunks: SearchChunk[];
  document: RetrievalDocument;
  embeddingModel: string;
  embeddings: number[][];
  module: string;
  sourceType: string;
}

export interface IndexedDocState {
  content_updated_at: string;
  doc_id: string;
  indexed_at: string;
}

export function createRetrievalStore(supabase: SupabaseClient) {
  const documents = () => supabase.schema(SCHEMA).from("documents");
  const chunks = () => supabase.schema(SCHEMA).from("chunks");
  const sourceVisibility = () =>
    supabase.schema(SCHEMA).from("source_visibility");

  async function registerSourceVisibility(
    sourceType: string,
    module: string,
    visibility: VisibilityKind
  ): Promise<void> {
    const { error } = await sourceVisibility().upsert(
      { module, source_type: sourceType, visibility },
      { onConflict: "source_type" }
    );
    if (error) {
      throw new Error(
        `Failed to register source visibility for ${sourceType}: ${error.message}`
      );
    }
  }

  async function upsertDocument(input: ChunkUpsertInput): Promise<void> {
    const { chunks: chunkRows, document, embeddings } = input;
    if (chunkRows.length !== embeddings.length) {
      throw new Error(
        `Chunk/embedding count mismatch for ${document.doc_id}: ${chunkRows.length} vs ${embeddings.length}`
      );
    }
    const base = {
      module: input.module,
      owner_user_id: document.owner_user_id ?? null,
      scope_id: document.scope_id ?? "default",
      source_type: input.sourceType,
      tenant_id: document.tenant_id,
    };
    const { error: docError } = await documents().upsert(
      {
        ...base,
        content_updated_at: document.source_updated_at,
        doc_id: document.doc_id,
        embedding_model: input.embeddingModel,
        entity_refs: document.entity_refs ?? [],
        indexed_at: new Date().toISOString(),
        metadata: document.filter_metadata ?? {},
        occurred_at: document.occurred_at ?? null,
        title: document.title ?? null,
      },
      { onConflict: "tenant_id,source_type,doc_id" }
    );
    if (docError) {
      throw new Error(
        `Failed to upsert search document ${document.doc_id}: ${docError.message}`
      );
    }
    // Shrinking documents leave stale tail chunks behind — drop them first.
    const { error: trimError } = await chunks()
      .delete()
      .eq("tenant_id", document.tenant_id)
      .eq("source_type", input.sourceType)
      .eq("doc_id", document.doc_id)
      .gte("chunk_index", chunkRows.length);
    if (trimError) {
      throw new Error(
        `Failed to trim search chunks for ${document.doc_id}: ${trimError.message}`
      );
    }
    const now = new Date().toISOString();
    const rows = chunkRows.map((chunk, index) => ({
      ...base,
      chunk_index: chunk.chunk_index,
      doc_id: document.doc_id,
      embedding: embeddings[index],
      embedding_model: input.embeddingModel,
      id: chunk.chunk_id,
      metadata: document.filter_metadata ?? {},
      occurred_at: document.occurred_at ?? null,
      text: chunk.text,
      updated_at: now,
    }));
    const { error: chunkError } = await chunks().upsert(rows, {
      onConflict: "tenant_id,id",
    });
    if (chunkError) {
      throw new Error(
        `Failed to upsert search chunks for ${document.doc_id}: ${chunkError.message}`
      );
    }
  }

  async function deleteDocument(input: {
    docId: string;
    sourceType: string;
    tenantId: string;
  }): Promise<void> {
    // Chunks cascade from the documents FK.
    const { error } = await documents()
      .delete()
      .eq("tenant_id", input.tenantId)
      .eq("source_type", input.sourceType)
      .eq("doc_id", input.docId);
    if (error) {
      throw new Error(
        `Failed to delete search document ${input.docId}: ${error.message}`
      );
    }
  }

  // Paged full scan per (tenant, source) — passing thousands of doc ids
  // through a PostgREST `in()` filter blows the URI limit (hit live with
  // 298 inbox messages). Callers intersect with their own source window.
  async function listIndexedDocs(
    tenantId: string,
    sourceType: string
  ): Promise<Map<string, IndexedDocState>> {
    const PAGE = 1000;
    const MAX_PAGES = 20;
    const map = new Map<string, IndexedDocState>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await documents()
        .select("doc_id, content_updated_at, indexed_at")
        .eq("tenant_id", tenantId)
        .eq("source_type", sourceType)
        .order("doc_id", { ascending: true })
        .range(page * PAGE, (page + 1) * PAGE - 1);
      if (error) {
        throw new Error(
          `Failed to list indexed documents for ${sourceType}: ${error.message}`
        );
      }
      const rows = (data ?? []) as IndexedDocState[];
      for (const row of rows) {
        map.set(String(row.doc_id), {
          content_updated_at: String(row.content_updated_at),
          doc_id: String(row.doc_id),
          indexed_at: String(row.indexed_at),
        });
      }
      if (rows.length < PAGE) {
        break;
      }
    }
    return map;
  }

  return {
    deleteDocument,
    listIndexedDocs,
    registerSourceVisibility,
    upsertDocument,
  };
}

export type RetrievalStore = ReturnType<typeof createRetrievalStore>;
