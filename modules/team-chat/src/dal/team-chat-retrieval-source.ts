// Central-retrieval registration (Phase 5): channel messages become
// `team-chat.message` documents in the workspace search store. DMs and group
// DMs are excluded (doc §12 v1 decision); tombstoned messages are dropped.
// Doc ids are composite `<conversation_id>:<ts>` because the module-bus events
// carry (conversation_id, message_ts), not the row uuid.
import type { RetrievalSourceRegistration } from "@engenty/retrieval";
import type { SearchResult } from "@engenty/search-index";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TEAM_CHAT_MESSAGE_SOURCE_TYPE = "team-chat.message";

const SCHEMA = "module_team_chat";
const SEARCHABLE_TYPES = ["public_channel", "private_channel"];

export interface TeamChatSearchMatch {
  conversation_id: string;
  matched_fields: string[];
  score: number;
  text: string;
  ts: string;
}

function docIdFor(conversationId: string, ts: string): string {
  return `${conversationId}:${ts}`;
}

function parseDocId(docId: string): { conversationId: string; ts: string } {
  const at = docId.lastIndexOf(":");
  return { conversationId: docId.slice(0, at), ts: docId.slice(at + 1) };
}

interface MessageRow {
  conversation_id: string;
  // `scope_id` lives on `conversations`, not `messages` — it rides in via the
  // embedded join below (PostgREST returns the to-one embed as an object).
  conversations?: { scope_id?: string | null; type?: string } | null;
  deleted_at: string | null;
  text: string;
  ts: string;
  updated_at: string;
  user_id: string | null;
}

export function createTeamChatRetrievalSource(options: {
  supabase: SupabaseClient;
}): RetrievalSourceRegistration<TeamChatSearchMatch> {
  const { supabase } = options;
  const messages = () => supabase.schema(SCHEMA).from("messages");

  async function loadMessage(
    docId: string,
    tenantId: string
  ): Promise<MessageRow | null> {
    const { conversationId, ts } = parseDocId(docId);
    const { data, error } = await messages()
      .select(
        "conversation_id, ts, text, user_id, deleted_at, updated_at, conversations!inner(type, scope_id)"
      )
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("ts", ts)
      .in("conversations.type", SEARCHABLE_TYPES)
      .maybeSingle();
    if (error) {
      throw new Error(`team-chat retrieval load failed: ${error.message}`);
    }
    return (data as MessageRow | null) ?? null;
  }

  return {
    buildDocument: async ({ doc_id, tenant_id }) => {
      const row = await loadMessage(doc_id, tenant_id);
      // Attachment-only messages have empty text — nothing searchable.
      if (!row || row.deleted_at || !row.text) {
        return null;
      }
      return {
        doc_id,
        filter_metadata: { conversation_id: row.conversation_id },
        occurred_at: row.updated_at,
        owner_user_id: null,
        scope_id: row.conversations?.scope_id ?? "default",
        source_id: doc_id,
        source_type: TEAM_CHAT_MESSAGE_SOURCE_TYPE,
        source_updated_at: row.updated_at,
        tenant_id,
        text: row.text,
        title: null,
      };
    },
    listDocuments: async ({ limit, tenant_id }) => {
      const { data, error } = await messages()
        .select("conversation_id, ts, updated_at, conversations!inner(type)")
        .eq("tenant_id", tenant_id)
        .is("deleted_at", null)
        .neq("text", "")
        .in("conversations.type", SEARCHABLE_TYPES)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) {
        throw new Error(`team-chat retrieval list failed: ${error.message}`);
      }
      return (
        (data ?? []) as {
          conversation_id: string;
          ts: string;
          updated_at: string;
        }[]
      ).map((row) => ({
        doc_id: docIdFor(row.conversation_id, row.ts),
        updated_at: String(row.updated_at),
      }));
    },
    module_id: "team-chat",
    onEvents: (["posted", "updated"] as const)
      .map((verb) => ({
        action: "replace" as const,
        docId: (payload: Record<string, unknown>) =>
          payload.conversation_id && payload.message_ts
            ? docIdFor(
                String(payload.conversation_id),
                String(payload.message_ts)
              )
            : null,
        name: `team-chat.message.${verb}`,
      }))
      .concat([
        {
          action: "delete" as never,
          docId: (payload: Record<string, unknown>) =>
            payload.conversation_id && payload.message_ts
              ? docIdFor(
                  String(payload.conversation_id),
                  String(payload.message_ts)
                )
              : null,
          name: "team-chat.message.deleted",
        },
      ]),
    operation: {
      entityName: "message",
      overrides: {
        idempotent: true,
        requiredCapabilities: ["module.team-chat.read"],
        riskLevel: "low",
        summary:
          "Semantic + lexical search over team-chat channel messages (DMs excluded)",
      },
    },
    retriever: {
      hydrate: async (matches, ctx) => {
        const results: SearchResult<TeamChatSearchMatch>[] = [];
        for (const match of matches) {
          const row = await loadMessage(match.doc_id, ctx.tenant_id);
          if (!row || row.deleted_at) {
            continue;
          }
          results.push({
            item: {
              conversation_id: row.conversation_id,
              matched_fields: match.matched_fields,
              score: match.score,
              text: row.text,
              ts: row.ts,
            },
            matched_fields: match.matched_fields,
            score: match.score,
            source_scores: { ...match.source_scores },
          });
        }
        return results;
      },
    },
    source_type: TEAM_CHAT_MESSAGE_SOURCE_TYPE,
    splitter: { mode: "none" },
    visibility: "tenant",
  };
}
