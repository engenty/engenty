// `inbox.message` SearchIndexProvider.
//
// Lexical-only v1: `search()` runs the `module_inbox.search_messages` FTS
// RPC directly against the message store — there is no derived index, so
// `replaceDocument`/`deleteDocument` are no-ops and the declarative re-index
// bindings exist only to keep the registration contract uniform. Semantic
// search can be layered on later (embedding table + replaceDocument) without
// changing the provider id or the synthesized tool.
//
// Visibility: the host injects the authenticated `filters.tenant_id` and
// `filters.user_id` (spoofed values are stripped); the RPC applies
// `owner_user_id is null or owner_user_id = user_id` so personal-connection
// messages never leak into org-wide results — from the FIRST index version.

import type {
  SearchIndexProvider,
  SearchIndexStatus,
  SearchProviderCapabilities,
  SearchRequest,
  SearchResponse,
  SearchResult,
} from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxMessage, InboxMessageStatus } from "../schema/types.js";
import { rowToMessage } from "./inbox-mappers.js";

const SCHEMA = "module_inbox";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export interface InboxSearchFilters {
  connection_id?: string;
  scope_id?: string | null;
  status?: InboxMessageStatus;
  tenant_id?: string | null;
  user_id?: string | null;
}

export interface InboxSearchMatch {
  message: InboxMessage;
  score: number;
}

export type InboxSearchProvider = SearchIndexProvider<
  never,
  InboxSearchFilters,
  InboxSearchMatch
>;

const CAPABILITIES: SearchProviderCapabilities = {
  hybrid: false,
  lexical: true,
  semantic: false,
};

export function createInboxSearchIndexProvider(options: {
  supabase: SupabaseClient;
}): InboxSearchProvider {
  const { supabase } = options;
  const messages = () => supabase.schema(SCHEMA).from("messages");

  async function search(
    request: SearchRequest<InboxSearchFilters>
  ): Promise<SearchResponse<InboxSearchMatch>> {
    const filters = request.filters ?? {};
    const tenantId = filters.tenant_id?.trim();
    if (!tenantId) {
      return { results: [], total: 0 };
    }
    const scopeId = filters.scope_id?.trim() || "default";
    const limit = Math.min(
      Math.max(request.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("search_messages", {
        p_connection_id: filters.connection_id ?? null,
        p_limit: limit,
        p_offset: Math.max(request.offset ?? 0, 0),
        p_query: (request.query ?? "").trim(),
        p_scope_id: scopeId,
        p_status: filters.status ?? null,
        p_tenant_id: tenantId,
        p_user_id: filters.user_id ?? null,
      });
    if (error) {
      throw new Error(`inbox search failed: ${error.message}`);
    }
    const payload = (data ?? {}) as {
      matches?: { id: string; score: number; thread_id: string }[];
      total?: number;
    };
    const matches = payload.matches ?? [];
    if (matches.length === 0) {
      return { results: [], total: Number(payload.total ?? 0) };
    }
    const { data: rows, error: loadError } = await messages()
      .select("*")
      .eq("tenant_id", tenantId)
      .in(
        "id",
        matches.map((match) => String(match.id))
      );
    if (loadError) {
      throw new Error(`inbox search load failed: ${loadError.message}`);
    }
    const byId = new Map(
      (rows ?? []).map((row) => [
        String((row as { id: string }).id),
        rowToMessage(row as Record<string, unknown>),
      ])
    );
    const results: SearchResult<InboxSearchMatch>[] = [];
    for (const match of matches) {
      const message = byId.get(String(match.id));
      if (!message) {
        continue;
      }
      results.push({
        item: { message, score: Number(match.score ?? 0) },
        matched_fields: [],
        score: Number(match.score ?? 0),
        source_scores: { fts: Number(match.score ?? 0) },
      });
    }
    return { results, total: Number(payload.total ?? results.length) };
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
    const { count } = await messages()
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    const total = count ?? 0;
    // FTS over the base table: every stored message is current by definition.
    return {
      current_count: total,
      indexed_count: total,
      last_indexed_at: null,
      missing_count: 0,
      stale_count: 0,
      total_count: total,
    };
  }

  return {
    capabilities: CAPABILITIES,
    // No derived index to maintain — the GIN index updates with the row.
    deleteDocument: () => Promise.resolve(),
    getStatus,
    id: "inbox.message",
    replaceDocument: () => Promise.resolve(),
    search,
    version: "1",
  };
}
