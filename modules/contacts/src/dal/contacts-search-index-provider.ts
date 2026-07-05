// `contacts.contact` SearchIndexProvider.
//
// Owns the contact search surface end-to-end:
//
//   - `search()` runs the existing `module_contacts.search_contacts` Postgres
//     RPC. Honors explicit `strategy: "lexical"` by skipping the embedder
//     entirely (BM25/FTS/trigram only) — important for hot quick-search paths
//     that should not pay for vectors just because vectors are available.
//
//   - `replaceDocument()` upserts the per-contact embedding row from the
//     pre-built document text supplied by `getDocumentById`. Empty text means
//     "delete the embedding row" (e.g. soft-deleted contact).
//
//   - `getDocumentById()` rebuilds the canonical document text (contact
//     fields + relations) so the SDK's declarative re-index binding can
//     `replace` from `<module>.<entity>.{created|updated}` events without the
//     module having to embed in the emit path.
//
// All write/read paths take `tenant_id` from `request.filters.tenant_id` (the
// synthesized op + admin route both inject this from authenticated context).
// Scope id is optional and falls back to `"default"`.

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
import type {
  Contact,
  ContactSearchMatch,
  ContactSearchSourceScores,
} from "../schema/types.js";
import {
  buildContactSearchDocument,
  DEFAULT_CONTACT_EMBEDDING_MODEL,
} from "../services/contact-embed.js";
import { rowToContact } from "./contact-mappers.js";

const SCHEMA = "module_contacts";
const CONTACTS_TABLE = "contacts";
const EMBEDDINGS_TABLE = "contact_search_embeddings";
const RELATIONS_TABLE = "contact_relations";
const ROLES_TABLE = "contact_roles";
const CONTACT_EMBEDDING_VECTOR_DIM = 1536;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const MAX_VECTOR_QUERIES = 5;
const MIN_TRIGRAM_SCORE = 0.18;
const MIN_VECTOR_SCORE = 0.72;
const DEFAULT_STATUS_LIMIT = 100;
const MAX_STATUS_LIMIT = 500;
const MAX_STATUS_SCAN = 5000;
const MAX_BACKFILL = 500;

const logger = createLogger({ name: "contacts-search-index" });

export interface ContactsSearchFilters {
  role?: string;
  scope_id?: string | null;
  tenant_id?: string | null;
  type?: "organisation" | "person";
}

export type ContactsSearchProvider = SearchIndexProvider<
  SearchDocument,
  ContactsSearchFilters,
  ContactSearchMatch
>;

export interface CreateContactsSearchIndexProviderOptions {
  embeddingModelId?: string;
  supabase: SupabaseClient;
}

interface RawSearchMatch {
  id: string;
  match_reason?: unknown;
  matched_fields?: unknown;
  score?: unknown;
  source_scores?: unknown;
}

interface RawSearchPayload {
  ids?: unknown;
  matches?: unknown;
  total?: unknown;
}

const CAPABILITIES: SearchProviderCapabilities = {
  hybrid: true,
  lexical: true,
  semantic: true,
};

function appendUniqueQuery(values: string[], value: string): void {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized &&
    !values.some(
      (existing) => existing.toLowerCase() === normalized.toLowerCase()
    )
  ) {
    values.push(normalized);
  }
}

function parseRpcPayload(raw: unknown): RawSearchPayload {
  if (raw == null) {
    return {};
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as RawSearchPayload)
        : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as RawSearchPayload)
    : {};
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string")
    : [];
}

function readSourceScores(raw: unknown): ContactSearchSourceScores {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    fts: Number(obj.fts ?? 0),
    role: Number(obj.role ?? 0),
    trigram: Number(obj.trigram ?? 0),
    vector: Number(obj.vector ?? 0),
  };
}

function readMatchReason(raw: unknown): ContactSearchMatch["match_reason"] {
  return raw === "filtered" ||
    raw === "fuzzy" ||
    raw === "role" ||
    raw === "semantic" ||
    raw === "text"
    ? raw
    : "filtered";
}

function hasConcreteSignal(
  match: Pick<ContactSearchMatch, "matched_fields" | "source_scores">,
  query: string,
  role: string | undefined
): boolean {
  if (!query) {
    return true;
  }
  if (role && match.matched_fields.includes("role")) {
    return true;
  }
  return (
    match.source_scores.fts > 0 ||
    match.source_scores.trigram >= MIN_TRIGRAM_SCORE ||
    match.source_scores.vector >= MIN_VECTOR_SCORE
  );
}

function clampLimit(limit: number | undefined, max: number, def: number) {
  return Math.min(Math.max(limit ?? def, 1), max);
}

function buildContactsEmbedder(modelId: string) {
  const lower = modelId.toLowerCase();
  // The AI SDK's `providerOptions` is typed as `Record<string, JSONObject>`
  // (no `undefined` allowed in index values). We carry the cast at the
  // declaration site and then forward it as `unknown` so the SDK's stricter
  // overload still accepts it.
  const providerOptions: Record<string, Record<string, unknown>> | undefined =
    lower.startsWith("google/")
      ? { google: { outputDimensionality: CONTACT_EMBEDDING_VECTOR_DIM } }
      : lower === "openai/text-embedding-3-large"
        ? { openai: { dimensions: CONTACT_EMBEDDING_VECTOR_DIM } }
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
      dimensions: CONTACT_EMBEDDING_VECTOR_DIM,
      maxBatchSize: 64,
      modelId,
    }
  );
}

export function createContactsSearchIndexProvider(
  options: CreateContactsSearchIndexProviderOptions
): ContactsSearchProvider {
  const { supabase } = options;
  const embeddingModelId =
    options.embeddingModelId?.trim() || DEFAULT_CONTACT_EMBEDDING_MODEL;
  const embedder = buildContactsEmbedder(embeddingModelId);

  const contacts = () => supabase.schema(SCHEMA).from(CONTACTS_TABLE);
  const embeddings = () => supabase.schema(SCHEMA).from(EMBEDDINGS_TABLE);
  const relations = () => supabase.schema(SCHEMA).from(RELATIONS_TABLE);
  const roles = () => supabase.schema(SCHEMA).from(ROLES_TABLE);

  async function getRolesByContactIds(
    ids: string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) {
      return map;
    }
    const { data } = await roles()
      .select("contact_id, role")
      .in("contact_id", ids);
    for (const row of data ?? []) {
      const id = String((row as { contact_id: string }).contact_id);
      const role = String((row as { role: string }).role);
      const arr = map.get(id) ?? [];
      if (!arr.includes(role)) {
        arr.push(role);
      }
      map.set(id, arr);
    }
    return map;
  }

  async function loadContactsByIds(
    ids: string[],
    tenantId: string,
    scopeId: string | null
  ): Promise<Map<string, Contact>> {
    if (ids.length === 0) {
      return new Map();
    }
    let query = contacts()
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids)
      .is("deleted_at", null);
    if (scopeId) {
      query = query.eq("scope_id", scopeId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load contacts: ${error.message}`);
    }
    const rolesByContactId = await getRolesByContactIds(
      (data ?? []).map((row) => String((row as { id: string }).id))
    );
    const map = new Map<string, Contact>();
    for (const row of data ?? []) {
      const id = String((row as { id: string }).id);
      map.set(
        id,
        rowToContact(
          row as Record<string, unknown>,
          rolesByContactId.get(id) ?? []
        )
      );
    }
    return map;
  }

  async function loadRelationTexts(
    contactId: string,
    tenantId: string,
    scopeId: string | null
  ): Promise<string[]> {
    let relQuery = relations()
      .select("*")
      .eq("tenant_id", tenantId)
      .or(`from_contact_id.eq.${contactId},to_contact_id.eq.${contactId}`);
    if (scopeId) {
      relQuery = relQuery.eq("scope_id", scopeId);
    }
    const { data: rels } = await relQuery;
    const otherContactIds = new Set<string>();
    for (const raw of rels ?? []) {
      const r = raw as { from_contact_id: string; to_contact_id: string };
      const otherId =
        String(r.from_contact_id) === contactId
          ? String(r.to_contact_id)
          : String(r.from_contact_id);
      otherContactIds.add(otherId);
    }
    const others = await loadContactsByIds(
      Array.from(otherContactIds),
      tenantId,
      scopeId
    );
    const lines: string[] = [];
    for (const raw of rels ?? []) {
      const r = raw as {
        department: string | null;
        from_contact_id: string;
        label: string | null;
        position: string | null;
        relation_type: string;
        role: string | null;
        to_contact_id: string;
      };
      const otherId =
        String(r.from_contact_id) === contactId
          ? String(r.to_contact_id)
          : String(r.from_contact_id);
      const other = others.get(otherId);
      const parts = [
        r.relation_type,
        r.label ?? null,
        r.role ?? null,
        r.position ?? null,
        r.department ?? null,
        other?.display_name ?? null,
      ].filter((part): part is string => Boolean(part?.trim()));
      if (parts.length > 0) {
        lines.push(parts.join(" "));
      }
    }
    return lines;
  }

  async function search(
    request: SearchRequest<ContactsSearchFilters>
  ): Promise<SearchResponse<ContactSearchMatch>> {
    const filters = request.filters ?? {};
    const tenantId = filters.tenant_id?.trim() ?? null;
    if (!tenantId) {
      return { results: [], total: 0 };
    }
    const scopeId = filters.scope_id?.trim() || "default";
    const limit = clampLimit(request.limit, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const offset = Math.max(request.offset ?? 0, 0);
    const query = (request.query ?? "").trim();
    const strategy: SearchStrategy = request.strategy ?? "hybrid";

    let queryEmbeddings: number[][] = [];
    // Explicit lexical → never pay for embeddings even when vectors exist.
    if (query.length > 0 && strategy !== "lexical") {
      const variants: string[] = [];
      appendUniqueQuery(variants, query);
      for (const token of query.split(/[^\p{L}\p{N}]+/u)) {
        appendUniqueQuery(variants, token);
      }
      try {
        queryEmbeddings = await embedTexts(
          embedder,
          variants.slice(0, MAX_VECTOR_QUERIES)
        );
      } catch (err) {
        logger.warn(
          "contacts query embedding failed; falling back to lexical",
          {
            error: err instanceof Error ? err.message : String(err),
          }
        );
        queryEmbeddings = [];
      }
    }

    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("search_contacts", {
        p_tenant_id: tenantId,
        p_scope_id: scopeId,
        p_query: query,
        p_limit: limit,
        p_offset: offset,
        p_type: filters.type ?? null,
        p_role: filters.role ?? null,
        p_query_embedding:
          queryEmbeddings.length > 0
            ? JSON.stringify(queryEmbeddings[0])
            : null,
        p_query_embeddings:
          queryEmbeddings.length > 0 ? JSON.stringify(queryEmbeddings) : null,
        p_query_variants: null,
        p_vector_threshold: MIN_VECTOR_SCORE,
        p_trigram_threshold: MIN_TRIGRAM_SCORE,
      });

    if (error) {
      throw new Error(`Contact search failed: ${error.message}`);
    }

    const payload = parseRpcPayload(data);
    const rawMatches = Array.isArray(payload.matches)
      ? (payload.matches as RawSearchMatch[])
      : [];
    const orderedIds =
      rawMatches.length > 0
        ? rawMatches.map((m) => String(m.id))
        : asStringArray(payload.ids);
    const contactsById = await loadContactsByIds(orderedIds, tenantId, scopeId);

    const seen = new Set<string>();
    const results: SearchResult<ContactSearchMatch>[] = [];
    for (const raw of rawMatches) {
      const id = String(raw.id);
      const contact = contactsById.get(id);
      if (!contact || seen.has(id)) {
        continue;
      }
      const matchedFields = asStringArray(raw.matched_fields);
      const sourceScores = readSourceScores(raw.source_scores);
      const matchReason = readMatchReason(raw.match_reason);
      const score = Number(raw.score ?? 0);
      const item: ContactSearchMatch = {
        contact,
        match_reason: matchReason,
        matched_fields: matchedFields,
        score,
        source_scores: sourceScores,
      };
      if (
        !hasConcreteSignal(
          { matched_fields: matchedFields, source_scores: sourceScores },
          query,
          filters.role
        )
      ) {
        continue;
      }
      seen.add(id);
      results.push({
        item,
        matched_fields: matchedFields,
        score,
        // `ContactSearchSourceScores` is a strict named record; the search
        // contract accepts an open `{ [source: string]: number | undefined }`
        // — both shapes describe the same data so we forward through.
        source_scores: { ...sourceScores },
      });
    }

    const reportedTotal = Number(payload.total ?? results.length);
    const total =
      results.length === rawMatches.length ? reportedTotal : results.length;
    return { results, total };
  }

  async function getDocumentById(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<SearchDocument | null> {
    const tenantId = input.tenant_id.trim();
    const contactId = input.doc_id.trim();
    if (!(tenantId && contactId)) {
      return null;
    }
    const found = await loadContactsByIds([contactId], tenantId, null);
    const contact = found.get(contactId);
    if (!contact) {
      return null;
    }
    const relationTexts = await loadRelationTexts(
      contactId,
      tenantId,
      contact.scope_id ?? null
    );
    const text = buildContactSearchDocument({ contact, relationTexts });
    return {
      doc_id: contact.id,
      scope_id: contact.scope_id ?? null,
      source_id: contact.id,
      source_type: "contacts.contact",
      tenant_id: contact.tenant_id,
      text,
    };
  }

  async function deleteDocument(input: {
    doc_id: string;
    tenant_id: string;
  }): Promise<void> {
    const tenantId = input.tenant_id.trim();
    const contactId = input.doc_id.trim();
    if (!(tenantId && contactId)) {
      return;
    }
    const { error } = await embeddings()
      .delete()
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId);
    if (error) {
      throw new Error(`Failed to delete contact embedding: ${error.message}`);
    }
  }

  async function replaceDocument(input: {
    document: SearchDocument;
  }): Promise<void> {
    const { document } = input;
    const tenantId = document.tenant_id?.trim();
    const contactId = document.doc_id?.trim();
    if (!(tenantId && contactId)) {
      return;
    }
    if (!document.text?.trim()) {
      await deleteDocument({ doc_id: contactId, tenant_id: tenantId });
      return;
    }
    const [embedding] = await embedTexts(embedder, [document.text]);
    if (!embedding) {
      throw new Error("Embedder returned no vectors for contact document");
    }
    const { error } = await embeddings().upsert(
      {
        contact_id: contactId,
        document_text: document.text,
        embedding,
        embedding_model: embedder.modelId,
        scope_id: document.scope_id ?? null,
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contact_id" }
    );
    if (error) {
      throw new Error(`Failed to upsert contact embedding: ${error.message}`);
    }
  }

  async function loadIndexState(tenantId: string, limit: number) {
    const { data: contactRows } = await contacts()
      .select("id, updated_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const contactRowsArr = (contactRows ?? []) as {
      id: string;
      updated_at: string;
    }[];
    const ids = contactRowsArr.map((row) => String(row.id));
    const { data: indexRows } = await embeddings()
      .select("contact_id, updated_at")
      .eq("tenant_id", tenantId)
      .in("contact_id", ids.length === 0 ? [""] : ids);
    const indexedAt = new Map<string, string>();
    for (const row of indexRows ?? []) {
      indexedAt.set(
        String((row as { contact_id: string }).contact_id),
        String((row as { updated_at: string }).updated_at)
      );
    }
    return { contactRowsArr, indexedAt };
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
    const { contactRowsArr, indexedAt } = await loadIndexState(
      tenantId,
      MAX_STATUS_SCAN
    );
    let current = 0;
    let stale = 0;
    let missing = 0;
    for (const row of contactRowsArr) {
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
      total_count: contactRowsArr.length,
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
    results: { contact_id: string; error?: string; ok: boolean }[];
  }> {
    const tenantId = input?.tenant_id?.trim();
    if (!tenantId) {
      return { failed: 0, processed: 0, results: [] };
    }
    const limit = clampLimit(input?.limit, MAX_BACKFILL, DEFAULT_STATUS_LIMIT);
    // Scan wide, work narrow: the missing/stale filter runs over the full
    // status window so repeated calls advance past the newest `limit`
    // contacts instead of re-checking the same window forever.
    const { contactRowsArr, indexedAt } = await loadIndexState(
      tenantId,
      MAX_STATUS_SCAN
    );
    const targetIds = contactRowsArr
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
    const results: { contact_id: string; error?: string; ok: boolean }[] = [];
    for (const id of targetIds) {
      try {
        const document = await getDocumentById({
          doc_id: id,
          tenant_id: tenantId,
        });
        if (document) {
          await replaceDocument({ document });
        } else {
          await deleteDocument({ doc_id: id, tenant_id: tenantId });
        }
        results.push({ contact_id: id, ok: true });
      } catch (err) {
        results.push({
          contact_id: id,
          error: err instanceof Error ? err.message : String(err),
          ok: false,
        });
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
    id: "contacts.contact",
    replaceDocument,
    search,
    version: "1",
  };
}
