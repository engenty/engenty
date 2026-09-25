// `inbox.message` retrieval source (retrieval-service Phase 3 — replaces the
// module-local hybrid provider + message_embeddings table).
//
// The central service owns storage, embedding, the fused query, status, and
// backfill. Inbox contributes the canonical mail document
// (`buildMessageSearchDocument`), Space visibility (a message is visible to
// the members and agents of the Space that owns its mailbox), connection/status
// filters, and hydration back into `InboxSearchMatch`.
//
// `updated` events re-ingest: status is filterable chunk metadata, so a
// triage change must refresh the row (the text is unchanged — one redundant
// embed call per status change is the price of a pushed-down status filter).

import type {
  RetrievalMatch,
  RetrievalSourceRegistration,
} from "@engenty/retrieval";
import type { SearchIndexProvider, SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboxMessage, InboxMessageStatus } from "../schema/types.js";
import { buildMessageSearchDocument } from "../services/message-embed.js";
import { rowToMessage } from "./inbox-mappers.js";

export const INBOX_MESSAGE_SOURCE_TYPE = "inbox.message";
const SCHEMA = "module_inbox";
// Question-style queries against mail bodies score low cosine — a German
// question about an outage hits the "Server Down" thread at ~0.47–0.50
// (measured on dev mail). 0.45 matches KB's tuned floor; the v2 provider's
// 0.62 guess silently hid exactly the ask-real-questions matches.
const MIN_VECTOR_SCORE = 0.45;

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
  [source: string]: number;
}

export interface InboxSearchMatch {
  match_reason: "filtered" | "semantic" | "text";
  matched_fields: string[];
  message: InboxMessage;
  score: number;
  source_scores: InboxSearchSourceScores;
}

/** Kept for gateway/UI code that holds the manufactured provider. */
export type InboxSearchProvider = SearchIndexProvider<
  never,
  InboxSearchFilters,
  InboxSearchMatch
>;

export function createInboxRetrievalSource(options: {
  /** Tenant-locked handle factory (engenty_server lane, RLS-enforced) — every
   * entry point below (build, list, hydrate) carries the tenant it runs for. */
  getDb: (auth: { tenantId: string }) => SupabaseClient;
}): RetrievalSourceRegistration<InboxSearchMatch> {
  const { getDb } = options;
  const messages = (tenantId: string) =>
    getDb({ tenantId }).schema(SCHEMA).from("messages");

  async function loadMessagesByIds(
    ids: string[],
    tenantId: string
  ): Promise<Map<string, InboxMessage>> {
    if (ids.length === 0) {
      return new Map();
    }
    const { data, error } = await messages(tenantId)
      .select("*")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if (error) {
      throw new Error(`inbox message load failed: ${error.message}`);
    }
    return new Map(
      (data ?? []).map((row) => [
        String((row as { id: string }).id),
        rowToMessage(row as Record<string, unknown>),
      ])
    );
  }

  function matchReason(
    match: RetrievalMatch
  ): InboxSearchMatch["match_reason"] {
    if (match.matched_fields.includes("text")) {
      return "text";
    }
    if (match.matched_fields.includes("semantic")) {
      return "semantic";
    }
    return "filtered";
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const found = await loadMessagesByIds([doc_id], tenant_id);
      const message = found.get(doc_id);
      if (!message) {
        return null;
      }
      return {
        doc_id,
        // Canonical object ref (chat rendering + context-graph identity).
        entity_refs: [`inbox:message:${doc_id}`],
        filter_metadata: {
          connection_id: message.connection_id,
          status: message.status,
        },
        occurred_at: message.received_at,
        scope_id: message.scope_id,
        source_id: doc_id,
        source_type: INBOX_MESSAGE_SOURCE_TYPE,
        source_updated_at: message.updated_at,
        space_id: message.space_id,
        tenant_id,
        text: buildMessageSearchDocument(message),
        title: message.subject,
      };
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await messages(tenant_id)
        .select("id, updated_at")
        .eq("tenant_id", tenant_id)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`inbox message list failed: ${error.message}`);
      }
      return ((data ?? []) as { id: string; updated_at: string }[]).map(
        (row) => ({
          doc_id: String(row.id),
          updated_at: String(row.updated_at),
        })
      );
    },
    module_id: "inbox",
    onEvents: [
      {
        action: "replace",
        docId: (payload) =>
          (payload as { message_id?: string }).message_id ?? null,
        name: "inbox.message.synced",
      },
      {
        action: "replace",
        docId: (payload) =>
          (payload as { message_id?: string }).message_id ?? null,
        name: "inbox.message.updated",
      },
      {
        action: "delete",
        docId: (payload) =>
          (payload as { message_id?: string }).message_id ?? null,
        name: "inbox.message.deleted",
      },
    ],
    operation: {
      entityName: "message",
      overrides: {
        idempotent: true,
        requiredCapabilities: ["module.inbox.read"],
        riskLevel: "low",
        summary:
          "Search synced inbox messages by sender, subject, body text, or natural-language question (hybrid lexical + semantic, local store — no provider quota)",
      },
      // Mail follows its account's Space: a Space-bound run searches that
      // Space's mail only (the host injects `space_ids`); a person without a
      // space searches the Spaces they are a member of (`space` visibility).
      spacePolicy: { kind: "account_mounted" },
    },
    retriever: {
      hydrate: async (matches, ctx) => {
        const byId = await loadMessagesByIds(
          Array.from(new Set(matches.map((match) => match.doc_id))),
          ctx.tenant_id
        );
        const results: SearchResult<InboxSearchMatch>[] = [];
        for (const match of matches) {
          const message = byId.get(match.doc_id);
          if (!message) {
            continue;
          }
          results.push({
            item: {
              match_reason: matchReason(match),
              matched_fields: match.matched_fields,
              message,
              score: match.score,
              source_scores: {
                fts: match.source_scores.fts,
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
        const metadata: Record<string, string> = {};
        if (
          typeof filters.connection_id === "string" &&
          filters.connection_id
        ) {
          metadata.connection_id = filters.connection_id;
        }
        if (typeof filters.status === "string" && filters.status) {
          metadata.status = filters.status;
        }
        return {
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          scope_id:
            typeof filters.scope_id === "string" ? filters.scope_id : undefined,
        };
      },
      vectorThreshold: MIN_VECTOR_SCORE,
    },
    source_type: INBOX_MESSAGE_SOURCE_TYPE,
    splitter: { mode: "none" },
    visibility: "space",
  };
}
