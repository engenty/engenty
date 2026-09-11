// `contacts.contact` retrieval source (retrieval-service Phase 4 — replaces
// the module-local provider + contact_search_embeddings table + the
// module_contacts.search_contacts RPC).
//
// The central service owns storage (search.documents/chunks), embedding, the
// fused FTS + title-trigram + vector query, status, and backfill. Contacts
// contributes what is genuinely contact-specific:
//
//   - document building (`buildContactSearchDocument` incl. relation texts)
//   - `title = display_name` + `useTrigram` so quick-search stays fuzzy on
//     misspelled names (the golden case: trigram now runs over the title
//     instead of the legacy wide fuzzy_text — see deviations below)
//   - type/role filter pushdown as chunk metadata; roles are MULTI-valued
//     per contact and stored as an array (`{ roles: [...] }`), which jsonb
//     containment matches as a subset (`{"roles":["client"]}` hits any
//     superset)
//   - the 0.72 vector floor (names are short documents — semantic scores on
//     short texts run high, so the generic 0.62 default over-matches)
//   - hydration back into the public `ContactSearchMatch` shape
//
// Deviations from the legacy provider/RPC, all intentional:
//   - Trigram fuzziness is title-only (display_name), not the legacy wide
//     fuzzy_text (emails, phone, vat ids, …). Exact tokens in those fields
//     still match via FTS over the document text.
//   - No multi-embedding query fan-out (legacy embedded the query plus each
//     token separately); the central pipeline embeds the query once.
//   - `match_reason: "role"` / a role source-score are gone: a role filter is
//     now a hard metadata filter, so it no longer boosts or explains matches
//     (legacy added a constant +1.0 to every row that already passed the
//     filter — rank-neutral).

import type {
  RetrievalMatch,
  RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type { SearchIndexProvider, SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact, ContactSearchMatch } from "../schema/types.js";
import {
  buildContactSearchDocument,
  DEFAULT_CONTACT_EMBEDDING_MODEL,
} from "../services/contact-embed.js";
import { rowToContact } from "./contact-mappers.js";

export const CONTACTS_CONTACT_SOURCE_TYPE = "contacts.contact";
const SCHEMA = "module_contacts";
// Names are short documents: cosine similarity runs high on short texts, so
// the semantic floor stays at the legacy MIN_VECTOR_SCORE instead of the
// central 0.62 default.
const MIN_VECTOR_SCORE = 0.72;

/** Public filter surface — unchanged from the legacy provider. */
export interface ContactsSearchFilters {
  role?: string;
  scope_id?: string | null;
  tenant_id?: string | null;
  type?: "organisation" | "person";
}

/** Kept for the repo/API code that holds the manufactured provider. */
export type ContactsSearchProvider = SearchIndexProvider<
  never,
  ContactsSearchFilters,
  ContactSearchMatch
>;

export function createContactsRetrievalSource(options: {
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced) — every
   * callback below carries the tenant id it operates for, so each read
   * resolves a handle pinned to that tenant. */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
}): RetrievalSourceRegistration<ContactSearchMatch> {
  const { getDb } = options;
  const contacts = (db: SupabaseClient) => db.schema(SCHEMA).from("contacts");
  const relations = (db: SupabaseClient) =>
    db.schema(SCHEMA).from("contact_relations");
  const roles = (db: SupabaseClient) => db.schema(SCHEMA).from("contact_roles");

  async function getRolesByContactIds(
    db: SupabaseClient,
    ids: string[]
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (ids.length === 0) {
      return map;
    }
    const { data } = await roles(db)
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
    const db = getDb({ tenantId });
    let query = contacts(db)
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
      db,
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
    let relQuery = relations(getDb({ tenantId }))
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

  function matchReason(
    match: RetrievalMatch
  ): ContactSearchMatch["match_reason"] {
    if (match.matched_fields.includes("text")) {
      return "text";
    }
    if (match.matched_fields.includes("fuzzy")) {
      return "fuzzy";
    }
    if (match.matched_fields.includes("semantic")) {
      return "semantic";
    }
    return "filtered";
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const found = await loadContactsByIds([doc_id], tenant_id, null);
      const contact = found.get(doc_id);
      if (!contact) {
        return null;
      }
      const relationTexts = await loadRelationTexts(
        doc_id,
        tenant_id,
        contact.scope_id ?? null
      );
      return {
        doc_id,
        // Canonical object ref — the same `module:entity:id` scheme chat
        // rendering uses (see docs/wip/chat-object-rendering.md §2).
        entity_refs: [`contacts:contact:${doc_id}`],
        filter_metadata: {
          roles: [...contact.roles],
          type: contact.type,
        },
        scope_id: contact.scope_id,
        source_id: doc_id,
        source_type: CONTACTS_CONTACT_SOURCE_TYPE,
        source_updated_at: contact.updated_at,
        tenant_id,
        text: buildContactSearchDocument({ contact, relationTexts }),
        title: contact.display_name,
      };
    },
    embedding: { model: DEFAULT_CONTACT_EMBEDDING_MODEL },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await contacts(getDb({ tenantId: tenant_id }))
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`Contact list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "contacts",
    onEvents: [
      {
        action: "replace",
        docId: (payload) =>
          (payload as { contact_id?: string }).contact_id ?? null,
        name: "contacts.contact.created",
      },
      {
        action: "replace",
        docId: (payload) =>
          (payload as { contact_id?: string }).contact_id ?? null,
        name: "contacts.contact.updated",
      },
      {
        action: "delete",
        docId: (payload) =>
          (payload as { contact_id?: string }).contact_id ?? null,
        name: "contacts.contact.deleted",
      },
    ],
    operation: {
      entityName: "contact",
      overrides: {
        idempotent: true,
        requiredCapabilities: ["module.contacts.read"],
        riskLevel: "low",
        summary:
          "Search contacts by name, organization, role, email, location, or relationships",
      },
      spacePolicy: { kind: "tenant_shared" },
    },
    retriever: {
      hydrate: async (matches, ctx) => {
        const byId = await loadContactsByIds(
          Array.from(new Set(matches.map((match) => match.doc_id))),
          ctx.tenant_id,
          null
        );
        const seen = new Set<string>();
        const results: SearchResult<ContactSearchMatch>[] = [];
        for (const match of matches) {
          const contact = byId.get(match.doc_id);
          if (!contact || seen.has(match.doc_id)) {
            continue;
          }
          seen.add(match.doc_id);
          results.push({
            item: {
              contact,
              match_reason: matchReason(match),
              matched_fields: match.matched_fields,
              score: match.score,
              source_scores: {
                fts: match.source_scores.fts,
                role: 0,
                trigram: match.source_scores.trigram,
                vector: match.source_scores.vector,
              },
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
        if (typeof filters.type === "string" && filters.type) {
          metadata.type = filters.type;
        }
        if (typeof filters.role === "string" && filters.role) {
          // Roles are multi-valued per contact; jsonb containment matches
          // the single requested role against the stored superset array.
          metadata.roles = [filters.role];
        }
        return {
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          scope_id:
            typeof filters.scope_id === "string" ? filters.scope_id : undefined,
        };
      },
      useTrigram: true,
      vectorThreshold: MIN_VECTOR_SCORE,
    },
    source_type: CONTACTS_CONTACT_SOURCE_TYPE,
    splitter: { mode: "none" },
    visibility: "tenant",
  };
}
