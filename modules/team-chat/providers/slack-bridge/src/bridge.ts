// The bridge core: binding storage on `conversations.external.slack`, the
// outbound replay (team-chat events → Slack via the connections Slack
// connector) and the inbound pull sync (Slack history → team-chat messages).
//
// Loop guards (design doc §14): outbound skips anything the bridge imported
// (metadata.slack_bridge.imported — set atomically at post time, so the
// posted event can never race the guard), and inbound skips every Slack ts
// already known locally (messages.external.slack.ts records both exports and
// imports).

import { createLogger } from "@engenty/telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markdownToMrkdwn, mrkdwnToMarkdown } from "./mrkdwn.js";

const logger = createLogger({ name: "team-chat-slack-bridge" });

const SCHEMA = "module_team_chat";

/** `conversations.external.slack` — the per-channel binding + sync state. */
export interface SlackBinding {
  channel_id: string;
  channel_name?: string;
  connection_id: string;
  /** Slack ts high-water mark for the inbound pull. */
  sync_cursor?: string;
  /** engenty user uuid → Slack user id, for native mention mapping. */
  user_map?: Record<string, string>;
}

export interface ConnectionsCaller {
  callAction(params: {
    actionId: string;
    connectionId: string;
    input: unknown;
    isAutonomous: boolean;
    principal: { principalId: string; principalType: "service" };
    tenantId: string;
  }): Promise<unknown>;
}

export interface BridgeDeps {
  connections: ConnectionsCaller;
  /** Posts an imported message through the team-chat DAL (ts + rollups). */
  postImported(input: {
    botId: string;
    conversationId: string;
    metadata: Record<string, unknown>;
    scopeId: string;
    tenantId: string;
    text: string;
    threadTs?: string;
  }): Promise<{ ts: string }>;
  supabase: SupabaseClient;
}

const PRINCIPAL = {
  principalId: "team-chat-slack-bridge",
  principalType: "service" as const,
};

// ── Binding storage ─────────────────────────────────────────────────────────

interface ConversationRow {
  external: Record<string, unknown> | null;
  id: string;
  scope_id: string;
  tenant_id: string;
  type: string;
}

function bindingOf(row: ConversationRow): SlackBinding | null {
  const slack = row.external?.slack as SlackBinding | undefined;
  return slack?.channel_id && slack.connection_id ? slack : null;
}

export async function getConversationRow(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("conversations")
    .select("id, tenant_id, scope_id, type, external")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw new Error(`slack-bridge conversation read failed: ${error.message}`);
  }
  return (data as ConversationRow | null) ?? null;
}

export async function listBoundConversations(
  supabase: SupabaseClient
): Promise<{ binding: SlackBinding; row: ConversationRow }[]> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("conversations")
    .select("id, tenant_id, scope_id, type, external")
    .not("external->slack->channel_id", "is", null)
    .eq("is_archived", false);
  if (error) {
    throw new Error(`slack-bridge binding scan failed: ${error.message}`);
  }
  return ((data ?? []) as ConversationRow[]).flatMap((row) => {
    const binding = bindingOf(row);
    return binding ? [{ binding, row }] : [];
  });
}

export async function writeBinding(
  supabase: SupabaseClient,
  conversationId: string,
  binding: SlackBinding | null
): Promise<void> {
  const row = await getConversationRow(supabase, conversationId);
  if (!row) {
    throw new Error("conversation not found");
  }
  const { slack: _removed, ...rest } = row.external ?? {};
  const external: Record<string, unknown> = binding
    ? { ...rest, slack: binding }
    : rest;
  const { error } = await supabase
    .schema(SCHEMA)
    .from("conversations")
    .update({ external, updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) {
    throw new Error(`slack-bridge binding write failed: ${error.message}`);
  }
}

// ── Message external map ────────────────────────────────────────────────────

interface MessageRow {
  agent_type_key: string | null;
  bot_id: string | null;
  external: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  subtype: string | null;
  text: string;
  thread_ts: string | null;
  ts: string;
  user_id: string | null;
}

async function getMessageRow(
  supabase: SupabaseClient,
  conversationId: string,
  ts: string
): Promise<MessageRow | null> {
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("messages")
    .select(
      "ts, thread_ts, text, subtype, metadata, external, user_id, agent_type_key, bot_id"
    )
    .eq("conversation_id", conversationId)
    .eq("ts", ts)
    .maybeSingle();
  if (error) {
    throw new Error(`slack-bridge message read failed: ${error.message}`);
  }
  return (data as MessageRow | null) ?? null;
}

async function setMessageSlackExternal(
  supabase: SupabaseClient,
  conversationId: string,
  ts: string,
  slack: Record<string, unknown>
): Promise<void> {
  const row = await getMessageRow(supabase, conversationId, ts);
  const external = { ...(row?.external ?? {}), slack };
  const { error } = await supabase
    .schema(SCHEMA)
    .from("messages")
    .update({ external })
    .eq("conversation_id", conversationId)
    .eq("ts", ts);
  if (error) {
    throw new Error(`slack-bridge message map write failed: ${error.message}`);
  }
}

/** Slack ts values (of this conversation) already known locally. */
async function knownSlackTs(
  supabase: SupabaseClient,
  conversationId: string,
  candidates: string[]
): Promise<Set<string>> {
  if (candidates.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase
    .schema(SCHEMA)
    .from("messages")
    .select("external")
    .eq("conversation_id", conversationId)
    .in("external->slack->>ts", candidates);
  if (error) {
    throw new Error(`slack-bridge dedup query failed: ${error.message}`);
  }
  return new Set(
    ((data ?? []) as { external: { slack?: { ts?: string } } | null }[])
      .map((row) => row.external?.slack?.ts)
      .filter((ts): ts is string => Boolean(ts))
  );
}

// ── Author labels ───────────────────────────────────────────────────────────

const userLabelCache = new Map<string, string>();

async function coreUserLabel(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const cached = userLabelCache.get(userId);
  if (cached) {
    return cached;
  }
  const { data } = await supabase
    .schema("core")
    .from("users")
    .select("display_name, email")
    .eq("id", userId)
    .maybeSingle();
  const label =
    (data as { display_name?: string; email?: string } | null)?.display_name ||
    (data as { email?: string } | null)?.email ||
    userId.slice(0, 8);
  userLabelCache.set(userId, label);
  return label;
}

// ── Outbound replay ─────────────────────────────────────────────────────────

/** Per-conversation serialization so replays keep message order. */
const outboundChains = new Map<string, Promise<void>>();

export function enqueueOutbound(
  deps: BridgeDeps,
  verb: "deleted" | "posted" | "updated",
  payload: { conversation_id: string; message_ts: string; tenant_id: string }
): void {
  const previous =
    outboundChains.get(payload.conversation_id) ?? Promise.resolve();
  const next = previous
    .then(() => replayEvent(deps, verb, payload))
    .catch((error) => {
      logger.warn("slack-bridge outbound replay failed", {
        conversationId: payload.conversation_id,
        message: error instanceof Error ? error.message : String(error),
        ts: payload.message_ts,
        verb,
      });
    });
  outboundChains.set(payload.conversation_id, next);
}

async function replayEvent(
  deps: BridgeDeps,
  verb: "deleted" | "posted" | "updated",
  payload: { conversation_id: string; message_ts: string; tenant_id: string }
): Promise<void> {
  const conversation = await getConversationRow(
    deps.supabase,
    payload.conversation_id
  );
  const binding = conversation ? bindingOf(conversation) : null;
  if (!(conversation && binding)) {
    return;
  }
  const message = await getMessageRow(
    deps.supabase,
    payload.conversation_id,
    payload.message_ts
  );
  if (!message || message.subtype) {
    return; // system/activity lines stay local
  }
  if ((message.metadata.slack_bridge as { imported?: boolean })?.imported) {
    return; // loop guard: came from Slack
  }
  const slack = message.external?.slack as
    | { exported_text?: string; ts?: string }
    | undefined;

  if (verb === "deleted") {
    // The connector deliberately ships no chat.delete; deletions stay local.
    logger.info("slack-bridge skipping delete (no delete action)", {
      conversationId: payload.conversation_id,
      ts: payload.message_ts,
    });
    return;
  }

  const authorLabel = message.user_id
    ? await coreUserLabel(deps.supabase, message.user_id)
    : (message.agent_type_key ?? message.bot_id ?? "system");
  const userLabel = (userId: string) => userLabelCache.get(userId) ?? null;
  const body = markdownToMrkdwn(message.text, {
    toSlackUser: binding.user_map,
    userLabel,
  });
  const text = `*${authorLabel}*: ${body}`;

  if (verb === "posted") {
    if (slack?.ts) {
      return; // already exported (redelivered event)
    }
    let threadTs: string | undefined;
    if (message.thread_ts && message.thread_ts !== message.ts) {
      const root = await getMessageRow(
        deps.supabase,
        payload.conversation_id,
        message.thread_ts
      );
      threadTs = (root?.external?.slack as { ts?: string } | undefined)?.ts;
    }
    const result = (await deps.connections.callAction({
      actionId: "post_message",
      connectionId: binding.connection_id,
      input: {
        channel: binding.channel_id,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      },
      isAutonomous: true,
      principal: PRINCIPAL,
      tenantId: payload.tenant_id,
    })) as { channel?: string; ts?: string };
    if (result?.ts) {
      await setMessageSlackExternal(
        deps.supabase,
        payload.conversation_id,
        message.ts,
        {
          channel: binding.channel_id,
          exported_text: message.text,
          ts: result.ts,
        }
      );
    }
    return;
  }

  // verb === "updated": replay text edits only (reaction churn also emits
  // `updated`; the exported_text comparison filters it).
  if (!slack?.ts || message.text === slack.exported_text) {
    return;
  }
  await deps.connections.callAction({
    actionId: "update_message",
    connectionId: binding.connection_id,
    input: { channel: binding.channel_id, text, ts: slack.ts },
    isAutonomous: true,
    principal: PRINCIPAL,
    tenantId: payload.tenant_id,
  });
  await setMessageSlackExternal(
    deps.supabase,
    payload.conversation_id,
    message.ts,
    { channel: binding.channel_id, exported_text: message.text, ts: slack.ts }
  );
}

// ── Inbound pull sync ───────────────────────────────────────────────────────

interface SlackHistoryMessage {
  reply_count: number;
  subtype: string | null;
  text: string;
  thread_ts: string | null;
  ts: string;
  user: string | null;
}

async function slackUserLabels(
  deps: BridgeDeps,
  connectionId: string,
  tenantId: string
): Promise<Map<string, string>> {
  const result = (await deps.connections.callAction({
    actionId: "list_users",
    connectionId,
    input: { limit: 50 },
    isAutonomous: true,
    principal: PRINCIPAL,
    tenantId,
  })) as { users?: { id: string; name: string; real_name: string }[] };
  return new Map(
    (result.users ?? []).map((user) => [
      user.id,
      user.real_name || user.name || user.id,
    ])
  );
}

export interface SyncSummary {
  conversations: number;
  errors: number;
  imported: number;
}

export async function runInboundSync(
  deps: BridgeDeps,
  options: { conversationId?: string } = {}
): Promise<SyncSummary> {
  const bound = (await listBoundConversations(deps.supabase)).filter(
    ({ row }) => !options.conversationId || row.id === options.conversationId
  );
  const summary: SyncSummary = {
    conversations: bound.length,
    errors: 0,
    imported: 0,
  };
  // Slack user labels per connection, resolved lazily once per run.
  const labelCache = new Map<string, Map<string, string>>();

  for (const { binding, row } of bound) {
    try {
      const history = (await deps.connections.callAction({
        actionId: "get_channel_history",
        connectionId: binding.connection_id,
        input: {
          channel: binding.channel_id,
          limit: 25,
          ...(binding.sync_cursor ? { oldest: binding.sync_cursor } : {}),
        },
        isAutonomous: true,
        principal: PRINCIPAL,
        tenantId: row.tenant_id,
      })) as { messages?: SlackHistoryMessage[] };

      // Newest-first from Slack; import chronologically.
      const batch = [...(history.messages ?? [])].reverse();
      const fresh = batch.filter(
        (message) =>
          !message.subtype && message.text && message.ts !== binding.sync_cursor
      );
      const known = await knownSlackTs(
        deps.supabase,
        row.id,
        fresh.map((message) => message.ts)
      );
      let cursor = binding.sync_cursor;
      for (const message of batch) {
        if (Number(message.ts) > Number(cursor ?? 0)) {
          cursor = message.ts;
        }
      }
      let labels = labelCache.get(binding.connection_id);
      for (const message of fresh) {
        if (known.has(message.ts)) {
          continue;
        }
        if (!labels) {
          labels = await slackUserLabels(
            deps,
            binding.connection_id,
            row.tenant_id
          );
          labelCache.set(binding.connection_id, labels);
        }
        const author = message.user
          ? (labels.get(message.user) ?? message.user)
          : "slack";
        const slackReverse: Record<string, string> = {};
        for (const [engentyId, slackId] of Object.entries(
          binding.user_map ?? {}
        )) {
          slackReverse[slackId] = engentyId;
        }
        const posted = await deps.postImported({
          botId: author,
          conversationId: row.id,
          metadata: {
            slack_bridge: {
              imported: true,
              slack_ts: message.ts,
              slack_user: message.user,
            },
          },
          scopeId: row.scope_id,
          tenantId: row.tenant_id,
          text: mrkdwnToMarkdown(message.text, {
            slackUserLabel: (id) => labels?.get(id) ?? null,
            toEngentyUser: slackReverse,
          }),
        });
        await setMessageSlackExternal(deps.supabase, row.id, posted.ts, {
          channel: binding.channel_id,
          imported: true,
          ts: message.ts,
        });
        summary.imported += 1;
      }
      if (cursor !== binding.sync_cursor) {
        await writeBinding(deps.supabase, row.id, {
          ...binding,
          sync_cursor: cursor,
        });
      }
    } catch (error) {
      summary.errors += 1;
      logger.warn("slack-bridge inbound sync failed for conversation", {
        conversationId: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return summary;
}
