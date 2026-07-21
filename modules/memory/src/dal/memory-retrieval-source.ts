// `memory.record` retrieval source. The central service owns storage
// (search.documents/chunks), embedding, and the fused FTS + trigram + vector
// query; this module contributes document building, scope filters as chunk
// metadata, and hydration back into MemoryRecord rows.
//
// Only ACTIVE records are indexed: buildDocument returns null for proposed and
// archived rows, so a `replace` event on a row that left 'active' drops it
// from the index (the host deletes when the document is gone) and archived
// consolidation losers vanish from search automatically.

import type { RetrievalSourceRegistration } from "@engenty/retrieval";
import type { SearchIndexProvider, SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryRecord } from "../schema/zod.js";
import { memoryRecordSchema } from "../schema/zod.js";

export const MEMORY_RECORD_SOURCE_TYPE = "memory.record";
const SCHEMA = "module_memory";

// As-you-type quick search stays lexical (no embedding round-trip) up to this
// many terms — same pattern as the knowledge-base source.
const FAST_PATH_MAX_TERMS = 2;

export interface MemorySearchFilters {
  kind?: string;
  scope_id?: string | null;
  scope_kind?: string;
  scope_ref?: string;
  tenant_id?: string | null;
}

export interface MemorySearchMatch {
  matched_fields: string[];
  record: MemoryRecord;
  score: number;
}

export type MemorySearchProvider = SearchIndexProvider<
  never,
  MemorySearchFilters,
  MemorySearchMatch
>;

export function createMemoryRetrievalSource(options: {
  supabase: SupabaseClient;
}): RetrievalSourceRegistration<MemorySearchMatch> {
  const { supabase } = options;
  const records = () => supabase.schema(SCHEMA).from("records");

  async function loadRecordsByIds(
    ids: string[],
    tenantId: string
  ): Promise<Map<string, MemoryRecord>> {
    const map = new Map<string, MemoryRecord>();
    if (ids.length === 0) {
      return map;
    }
    const { data, error } = await records()
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) {
      throw new Error(`Failed to load memory records: ${error.message}`);
    }
    for (const row of data ?? []) {
      const record = memoryRecordSchema.parse(row);
      map.set(record.id, record);
    }
    return map;
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const found = await loadRecordsByIds([doc_id], tenant_id);
      const record = found.get(doc_id);
      if (record?.status !== "active") {
        return null;
      }
      return {
        doc_id,
        entity_refs: [`memory:record:${doc_id}`],
        filter_metadata: {
          kind: record.kind,
          scope_kind: record.scope_kind,
          ...(record.scope_ref ? { scope_ref: record.scope_ref } : {}),
          confidence: record.confidence,
        },
        scope_id: record.scope_id,
        source_id: doc_id,
        source_type: MEMORY_RECORD_SOURCE_TYPE,
        source_updated_at: record.updated_at,
        tenant_id,
        text: `${record.title}\n\n${record.body_md}`,
        title: record.title,
      };
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await records()
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`Memory record list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "memory",
    onEvents: [
      {
        action: "replace",
        docId: (payload) =>
          (payload as { record_id?: string }).record_id ?? null,
        name: "memory.record.created",
      },
      {
        action: "replace",
        docId: (payload) =>
          (payload as { record_id?: string }).record_id ?? null,
        name: "memory.record.updated",
      },
      // Archive is a status flip, not a row delete — but the index entry must
      // go. The DAL emits `archived`; the binding deletes the document.
      {
        action: "delete",
        docId: (payload) =>
          (payload as { record_id?: string }).record_id ?? null,
        name: "memory.record.archived",
      },
    ],
    operation: {
      entityName: "record",
      overrides: {
        idempotent: true,
        requiredCapabilities: ["module.memory.read"],
        riskLevel: "low",
        summary:
          "Search durable memories (facts, preferences, lessons, decisions) " +
          "by content, optionally filtered by scope_kind/scope_ref/kind",
      },
    },
    retriever: {
      fastPath: { maxTerms: FAST_PATH_MAX_TERMS },
      hydrate: async (matches, ctx) => {
        const byId = await loadRecordsByIds(
          Array.from(new Set(matches.map((match) => match.doc_id))),
          ctx.tenant_id
        );
        const seen = new Set<string>();
        const results: SearchResult<MemorySearchMatch>[] = [];
        for (const match of matches) {
          const record = byId.get(match.doc_id);
          if (record?.status !== "active" || seen.has(match.doc_id)) {
            continue;
          }
          seen.add(match.doc_id);
          results.push({
            item: {
              matched_fields: match.matched_fields,
              record,
              score: match.score,
            },
            matched_fields: match.matched_fields,
            score: match.score,
            source_scores: { ...match.source_scores },
          });
        }
        return results;
      },
      mapFilters: (filters) => {
        const metadata: Record<string, string | string[]> = {};
        if (typeof filters.scope_kind === "string" && filters.scope_kind) {
          metadata.scope_kind = filters.scope_kind;
        }
        if (typeof filters.scope_ref === "string" && filters.scope_ref) {
          metadata.scope_ref = filters.scope_ref;
        }
        if (typeof filters.kind === "string" && filters.kind) {
          metadata.kind = filters.kind;
        }
        return {
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          scope_id:
            typeof filters.scope_id === "string" ? filters.scope_id : undefined,
        };
      },
    },
    source_type: MEMORY_RECORD_SOURCE_TYPE,
    splitter: { mode: "none" },
    visibility: "tenant",
  };
}
