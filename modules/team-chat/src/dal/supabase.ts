import type { SupabaseClient } from "@supabase/supabase-js";
import { memberHash } from "../lib/mentions.js";
import type {
  Conversation,
  ConversationListItem,
  ConversationMember,
  ConversationsCreateParams,
  MemberPrincipal,
  PaginatedMessages,
  PinsListResult,
  ReactionAggregate,
  SearchMessagesResult,
  TeamChatMessage,
} from "../schema/types.js";
import type {
  EmitTeamChatEvent,
  HistoryQuery,
  PostMessageRecord,
  RepliesQuery,
  TeamChatRepo,
} from "./contracts.js";
import { TeamChatError } from "./contracts.js";

const SCHEMA = "module_team_chat";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const UNIQUE_VIOLATION = "23505";

export interface CreateTeamChatRepoSupabaseOptions {
  emitTeamChatEvent?: EmitTeamChatEvent;
}

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    created_at: row.created_at as string,
    created_by: (row.created_by as string | null) ?? null,
    id: row.id as string,
    is_archived: Boolean(row.is_archived),
    name: (row.name as string | null) ?? null,
    project_id: (row.project_id as string | null) ?? null,
    purpose: (row.purpose as string | null) ?? null,
    scope_id: row.scope_id as string,
    settings: (row.settings as Record<string, unknown>) ?? {},
    tenant_id: row.tenant_id as string,
    topic: (row.topic as string | null) ?? null,
    type: row.type as Conversation["type"],
    updated_at: row.updated_at as string,
  };
}

function rowToMessage(row: Record<string, unknown>): TeamChatMessage {
  const deleted = row.deleted_at != null;
  return {
    agent_type_key: (row.agent_type_key as string | null) ?? null,
    attachments: (row.attachments as Record<string, unknown>[]) ?? [],
    blocks: (row.blocks as Record<string, unknown>[]) ?? [],
    bot_id: (row.bot_id as string | null) ?? null,
    conversation_id: row.conversation_id as string,
    created_at: row.created_at as string,
    deleted,
    edited: (row.edited as TeamChatMessage["edited"]) ?? null,
    files: deleted ? [] : ((row.files as Record<string, unknown>[]) ?? []),
    latest_reply: (row.latest_reply as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    reactions: [],
    reply_count: Number(row.reply_count ?? 0),
    reply_users: (row.reply_users as string[]) ?? [],
    subtype: (row.subtype as string | null) ?? null,
    text: deleted ? "" : ((row.text as string) ?? ""),
    thread_ts: (row.thread_ts as string | null) ?? null,
    ts: row.ts as string,
    updated_at: row.updated_at as string,
    user_id: (row.user_id as string | null) ?? null,
  };
}

function rowToMember(row: Record<string, unknown>): ConversationMember {
  return {
    conversation_id: row.conversation_id as string,
    created_at: row.created_at as string,
    id: row.id as string,
    last_read_ts: (row.last_read_ts as string | null) ?? null,
    muted: Boolean(row.muted),
    principal_id: row.principal_id as string,
    principal_type: row.principal_type as ConversationMember["principal_type"],
    role: row.role as ConversationMember["role"],
  };
}

/**
 * The repo runs on the service-role client, so tenant/scope and membership
 * are enforced here explicitly (RLS only guards the realtime/authenticated
 * path). `userId` is the acting user; `null` means a service caller (system
 * posts, activity streamer) that bypasses membership for subtype messages.
 */
export function createTeamChatRepoSupabase(
  adapter: unknown,
  tenantId: string,
  scopeId: string,
  userId: string | null,
  options: CreateTeamChatRepoSupabaseOptions = {}
): TeamChatRepo {
  const supabase = adapter as SupabaseClient;
  const conversations = () => supabase.schema(SCHEMA).from("conversations");
  const membersTbl = () => supabase.schema(SCHEMA).from("conversation_members");
  const messagesTbl = () => supabase.schema(SCHEMA).from("messages");
  const reactionsTbl = () => supabase.schema(SCHEMA).from("reactions");
  const pinsTbl = () => supabase.schema(SCHEMA).from("pins");
  const emit: EmitTeamChatEvent = options.emitTeamChatEvent ?? (() => {});

  async function getConversationRow(id: string): Promise<Conversation> {
    const { data, error } = await conversations()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("id", id)
      .maybeSingle();
    if (error) {
      throw new Error(`team-chat conversation get failed: ${error.message}`);
    }
    if (!data) {
      throw new TeamChatError("not_found");
    }
    return rowToConversation(data as Record<string, unknown>);
  }

  async function memberRow(
    conversationId: string
  ): Promise<Record<string, unknown> | null> {
    if (!userId) {
      return null;
    }
    const { data, error } = await membersTbl()
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("principal_type", "user")
      .eq("principal_id", userId)
      .maybeSingle();
    if (error) {
      throw new Error(`team-chat member get failed: ${error.message}`);
    }
    return (data as Record<string, unknown>) ?? null;
  }

  async function membership(conversationId: string) {
    const conversation = await getConversationRow(conversationId);
    const member = await memberRow(conversationId);
    return {
      conversation,
      role: member ? (member.role as "member" | "owner") : null,
    };
  }

  /** Members may read; public channels are readable by any tenant user. */
  async function requireReadable(conversationId: string) {
    const state = await membership(conversationId);
    if (state.role || state.conversation.type === "public_channel") {
      return state;
    }
    // Service callers read everything (activity streamer, admin surface).
    if (!userId) {
      return state;
    }
    throw new TeamChatError("not_member");
  }

  async function requireMember(conversationId: string) {
    const state = await membership(conversationId);
    if (!state.role) {
      throw new TeamChatError("not_member");
    }
    return state;
  }

  async function insertMembers(
    conversationId: string,
    members: MemberPrincipal[],
    role: "member" | "owner" = "member"
  ): Promise<void> {
    if (members.length === 0) {
      return;
    }
    const { error } = await membersTbl().upsert(
      members.map((member) => ({
        conversation_id: conversationId,
        principal_id:
          member.principal_type === "user"
            ? member.principal_id.toLowerCase()
            : member.principal_id,
        principal_type: member.principal_type,
        role,
        tenant_id: tenantId,
      })),
      {
        ignoreDuplicates: true,
        onConflict: "conversation_id,principal_type,principal_id",
      }
    );
    if (error) {
      throw new Error(`team-chat invite failed: ${error.message}`);
    }
  }

  async function listForCaller(options: {
    includeArchived?: boolean;
    includePublic?: boolean;
  }): Promise<ConversationListItem[]> {
    if (!userId) {
      throw new TeamChatError("not_allowed", "requires a user context");
    }
    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("list_my_conversations", {
        p_include_archived: options.includeArchived ?? false,
        p_include_public: options.includePublic ?? false,
        p_scope_id: scopeId,
        p_tenant_id: tenantId,
        p_user_id: userId,
      });
    if (error) {
      throw new Error(`team-chat list failed: ${error.message}`);
    }
    return (data ?? []) as ConversationListItem[];
  }

  async function getForCaller(
    id: string
  ): Promise<ConversationListItem | null> {
    const all = await listForCaller({
      includeArchived: true,
      includePublic: true,
    });
    return all.find((conversation) => conversation.id === id) ?? null;
  }

  async function createChannel(
    params: ConversationsCreateParams
  ): Promise<Conversation> {
    if (!userId) {
      throw new TeamChatError("not_allowed", "requires a user context");
    }
    const { data, error } = await conversations()
      .insert({
        created_by: userId,
        name: params.name,
        purpose: params.purpose ?? null,
        scope_id: scopeId,
        tenant_id: tenantId,
        topic: params.topic ?? null,
        type: params.is_private ? "private_channel" : "public_channel",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new TeamChatError("channel_exists", params.name);
      }
      throw new Error(`team-chat create failed: ${error.message}`);
    }
    const conversation = rowToConversation(data as Record<string, unknown>);
    await insertMembers(
      conversation.id,
      [{ principal_id: userId, principal_type: "user" }],
      "owner"
    );
    return conversation;
  }

  async function openDm(peerUserIds: string[]): Promise<Conversation> {
    if (!userId) {
      throw new TeamChatError("not_allowed", "requires a user context");
    }
    const allIds = [
      ...new Set([...peerUserIds, userId].map((value) => value.toLowerCase())),
    ];
    if (allIds.length < 2) {
      throw new TeamChatError("invalid_target", "a DM needs a peer");
    }
    const hash = memberHash(allIds);
    const existing = await conversations()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("member_hash", hash)
      .in("type", ["im", "mpim"])
      .maybeSingle();
    if (existing.error) {
      throw new Error(`team-chat open failed: ${existing.error.message}`);
    }
    if (existing.data) {
      return rowToConversation(existing.data as Record<string, unknown>);
    }
    const { data, error } = await conversations()
      .insert({
        created_by: userId,
        member_hash: hash,
        scope_id: scopeId,
        tenant_id: tenantId,
        type: allIds.length === 2 ? "im" : "mpim",
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        // Lost the race — the winner's row is the conversation.
        const retry = await conversations()
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("member_hash", hash)
          .in("type", ["im", "mpim"])
          .single();
        if (retry.error) {
          throw new Error(`team-chat open failed: ${retry.error.message}`);
        }
        return rowToConversation(retry.data as Record<string, unknown>);
      }
      throw new Error(`team-chat open failed: ${error.message}`);
    }
    const conversation = rowToConversation(data as Record<string, unknown>);
    await insertMembers(
      conversation.id,
      allIds.map((id) => ({ principal_id: id, principal_type: "user" }))
    );
    return conversation;
  }

  async function updateConversation(
    id: string,
    patch: Record<string, unknown>
  ): Promise<Conversation> {
    const { data, error } = await conversations()
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        throw new TeamChatError("channel_exists");
      }
      throw new Error(`team-chat update failed: ${error.message}`);
    }
    return rowToConversation(data as Record<string, unknown>);
  }

  /** Fold reaction rows into the Slack aggregate shape on each message. */
  async function attachReactions(
    conversationId: string,
    messages: TeamChatMessage[]
  ): Promise<TeamChatMessage[]> {
    if (messages.length === 0) {
      return messages;
    }
    const { data, error } = await reactionsTbl()
      .select("message_ts, emoji, principal_id")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .in(
        "message_ts",
        messages.map((message) => message.ts)
      )
      .order("created_at", { ascending: true });
    if (error) {
      throw new Error(`team-chat reactions load failed: ${error.message}`);
    }
    const byTs = new Map<string, Map<string, string[]>>();
    for (const row of (data ?? []) as {
      emoji: string;
      message_ts: string;
      principal_id: string;
    }[]) {
      const emojis = byTs.get(row.message_ts) ?? new Map<string, string[]>();
      const users = emojis.get(row.emoji) ?? [];
      users.push(row.principal_id);
      emojis.set(row.emoji, users);
      byTs.set(row.message_ts, emojis);
    }
    return messages.map((message) => {
      const emojis = byTs.get(message.ts);
      if (!emojis) {
        return message;
      }
      const reactions: ReactionAggregate[] = [...emojis.entries()].map(
        ([name, users]) => ({ count: users.length, name, users })
      );
      return { ...message, reactions };
    });
  }

  async function history(query: HistoryQuery): Promise<PaginatedMessages> {
    await requireReadable(query.conversationId);
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    let req = messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", query.conversationId)
      .is("thread_ts", null)
      .is("deleted_at", null)
      .order("ts", { ascending: false })
      .limit(limit + 1);
    // ts is fixed-width until 2286, so text comparison == numeric comparison.
    const latest = query.cursor ?? query.latest;
    if (latest) {
      req =
        query.inclusive && !query.cursor
          ? req.lte("ts", latest)
          : req.lt("ts", latest);
    }
    if (query.oldest) {
      req = query.inclusive
        ? req.gte("ts", query.oldest)
        : req.gt("ts", query.oldest);
    }
    const { data, error } = await req;
    if (error) {
      throw new Error(`team-chat history failed: ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      has_more: hasMore,
      messages: await attachReactions(
        query.conversationId,
        page.map(rowToMessage)
      ),
      ok: true,
      response_metadata: {
        next_cursor: hasMore ? (page.at(-1)?.ts as string) : null,
      },
    };
  }

  async function replies(query: RepliesQuery): Promise<PaginatedMessages> {
    await requireReadable(query.conversationId);
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const parent = await messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", query.conversationId)
      .eq("ts", query.threadTs)
      .maybeSingle();
    if (parent.error) {
      throw new Error(`team-chat replies failed: ${parent.error.message}`);
    }
    if (!parent.data) {
      throw new TeamChatError("message_not_found");
    }
    let req = messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", query.conversationId)
      .eq("thread_ts", query.threadTs)
      .is("deleted_at", null)
      .order("ts", { ascending: true })
      .limit(limit + 1);
    if (query.cursor) {
      req = req.gt("ts", query.cursor);
    }
    const { data, error } = await req;
    if (error) {
      throw new Error(`team-chat replies failed: ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    const messages = query.cursor
      ? page.map(rowToMessage)
      : [
          rowToMessage(parent.data as Record<string, unknown>),
          ...page.map(rowToMessage),
        ];
    return {
      has_more: hasMore,
      messages: await attachReactions(query.conversationId, messages),
      ok: true,
      response_metadata: {
        next_cursor: hasMore ? (page.at(-1)?.ts as string) : null,
      },
    };
  }

  async function post(record: PostMessageRecord): Promise<TeamChatMessage> {
    const state = await membership(record.conversationId);
    if (state.conversation.is_archived) {
      throw new TeamChatError("cannot_post", "conversation is archived");
    }
    if (userId) {
      if (!state.role) {
        throw new TeamChatError("not_member");
      }
    } else if (!record.subtype) {
      // Service callers may only post system messages.
      throw new TeamChatError("cannot_post", "service posts need a subtype");
    }
    const { data, error } = await supabase.schema(SCHEMA).rpc("post_message", {
      p_agent_type_key: null,
      p_blocks: record.blocks ?? [],
      p_bot_id: null,
      p_conversation_id: record.conversationId,
      p_files: record.files ?? [],
      p_mentions: record.mentions ?? [],
      p_metadata: record.metadata ?? {},
      p_subtype: record.subtype ?? null,
      p_tenant_id: tenantId,
      p_text: record.text,
      p_thread_ts: record.threadTs ?? null,
      p_user_id: userId,
    });
    if (error) {
      if (error.message.includes("thread_not_found")) {
        throw new TeamChatError("message_not_found", "thread parent");
      }
      throw new Error(`team-chat post failed: ${error.message}`);
    }
    const message = rowToMessage(data as Record<string, unknown>);
    await emit("posted", {
      conversation_id: record.conversationId,
      message_ts: message.ts,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
    return message;
  }

  async function getMessageRow(
    conversationId: string,
    ts: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("ts", ts)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) {
      throw new Error(`team-chat message get failed: ${error.message}`);
    }
    if (!data) {
      throw new TeamChatError("message_not_found");
    }
    return data as Record<string, unknown>;
  }

  async function update(
    conversationId: string,
    ts: string,
    patch: { blocks?: Record<string, unknown>[]; text: string }
  ): Promise<TeamChatMessage> {
    const row = await getMessageRow(conversationId, ts);
    if (!userId || row.user_id !== userId) {
      throw new TeamChatError("not_allowed", "only the author can edit");
    }
    const { data, error } = await messagesTbl()
      .update({
        blocks: patch.blocks ?? row.blocks,
        edited: { ts: `${Math.floor(Date.now() / 1000)}.000000`, user: userId },
        text: patch.text,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("ts", ts)
      .select("*")
      .single();
    if (error) {
      throw new Error(`team-chat message update failed: ${error.message}`);
    }
    const message = rowToMessage(data as Record<string, unknown>);
    await emit("updated", {
      conversation_id: conversationId,
      message_ts: ts,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
    return message;
  }

  async function softDelete(
    conversationId: string,
    ts: string
  ): Promise<TeamChatMessage> {
    const row = await getMessageRow(conversationId, ts);
    if (userId && row.user_id !== userId) {
      const state = await membership(conversationId);
      if (state.role !== "owner") {
        throw new TeamChatError(
          "not_allowed",
          "only the author or a channel owner can delete"
        );
      }
    }
    const { data, error } = await supabase
      .schema(SCHEMA)
      .rpc("soft_delete_message", {
        p_conversation_id: conversationId,
        p_ts: ts,
      });
    if (error) {
      throw new Error(`team-chat message delete failed: ${error.message}`);
    }
    const message = rowToMessage(data as Record<string, unknown>);
    await emit("deleted", {
      conversation_id: conversationId,
      message_ts: ts,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
    return message;
  }

  async function requireMessage(
    conversationId: string,
    ts: string
  ): Promise<void> {
    await getMessageRow(conversationId, ts);
  }

  async function mutateReaction(
    action: "add" | "remove",
    conversationId: string,
    ts: string,
    emoji: string
  ): Promise<void> {
    if (!userId) {
      throw new TeamChatError("not_allowed", "requires a user context");
    }
    await requireMember(conversationId);
    await requireMessage(conversationId, ts);
    if (action === "add") {
      const { error } = await reactionsTbl().upsert(
        {
          conversation_id: conversationId,
          emoji,
          message_ts: ts,
          principal_id: userId,
          principal_type: "user",
          tenant_id: tenantId,
        },
        {
          ignoreDuplicates: true,
          onConflict:
            "conversation_id,message_ts,emoji,principal_type,principal_id",
        }
      );
      if (error) {
        throw new Error(`team-chat reaction add failed: ${error.message}`);
      }
    } else {
      const { error } = await reactionsTbl()
        .delete()
        .eq("conversation_id", conversationId)
        .eq("message_ts", ts)
        .eq("emoji", emoji)
        .eq("principal_type", "user")
        .eq("principal_id", userId);
      if (error) {
        throw new Error(`team-chat reaction remove failed: ${error.message}`);
      }
    }
    await emit("updated", {
      conversation_id: conversationId,
      message_ts: ts,
      scope_id: scopeId,
      tenant_id: tenantId,
    });
  }

  /** Conversations the caller may read: memberships ∪ public channels. */
  async function visibleConversationIds(): Promise<string[]> {
    const ids = new Set<string>();
    const publicChannels = await conversations()
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("scope_id", scopeId)
      .eq("type", "public_channel");
    if (publicChannels.error) {
      throw new Error(
        `team-chat visibility failed: ${publicChannels.error.message}`
      );
    }
    for (const row of (publicChannels.data ?? []) as { id: string }[]) {
      ids.add(row.id);
    }
    if (userId) {
      const memberships = await membersTbl()
        .select("conversation_id")
        .eq("tenant_id", tenantId)
        .eq("principal_type", "user")
        .eq("principal_id", userId);
      if (memberships.error) {
        throw new Error(
          `team-chat visibility failed: ${memberships.error.message}`
        );
      }
      for (const row of (memberships.data ?? []) as {
        conversation_id: string;
      }[]) {
        ids.add(row.conversation_id);
      }
    }
    return [...ids];
  }

  async function search(
    query: string,
    limit = 25
  ): Promise<SearchMessagesResult> {
    const ids = await visibleConversationIds();
    if (ids.length === 0) {
      return { messages: [], ok: true, total: 0 };
    }
    const { data, error } = await messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .in("conversation_id", ids)
      .is("deleted_at", null)
      .textSearch("text", query, { config: "simple", type: "plain" })
      .order("ts", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    if (error) {
      throw new Error(`team-chat search failed: ${error.message}`);
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    const convIds = [
      ...new Set(rows.map((row) => row.conversation_id as string)),
    ];
    const names = new Map<string, string | null>();
    if (convIds.length > 0) {
      const convs = await conversations().select("id, name").in("id", convIds);
      if (convs.error) {
        throw new Error(`team-chat search failed: ${convs.error.message}`);
      }
      for (const row of (convs.data ?? []) as {
        id: string;
        name: string | null;
      }[]) {
        names.set(row.id, row.name);
      }
    }
    const messages = rows.map((row) => ({
      ...rowToMessage(row),
      conversation_name: names.get(row.conversation_id as string) ?? null,
    }));
    return { messages, ok: true, total: messages.length };
  }

  async function listPins(
    conversationId: string
  ): Promise<PinsListResult["pins"]> {
    await requireReadable(conversationId);
    const { data, error } = await pinsTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new Error(`team-chat pins list failed: ${error.message}`);
    }
    const pins = (data ?? []) as Record<string, unknown>[];
    if (pins.length === 0) {
      return [];
    }
    const messages = await messagesTbl()
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .in(
        "ts",
        pins.map((pin) => pin.message_ts as string)
      );
    if (messages.error) {
      throw new Error(`team-chat pins list failed: ${messages.error.message}`);
    }
    const byTs = new Map(
      ((messages.data ?? []) as Record<string, unknown>[]).map((row) => [
        row.ts as string,
        rowToMessage(row),
      ])
    );
    return pins.map((pin) => ({
      created_at: pin.created_at as string,
      message: byTs.get(pin.message_ts as string) ?? null,
      message_ts: pin.message_ts as string,
      pinned_by: (pin.pinned_by as string | null) ?? null,
    }));
  }

  return {
    conversations: {
      archive: async (id, archived) => {
        await requireMember(id);
        return updateConversation(id, { is_archived: archived });
      },
      createChannel,
      getForCaller,
      invite: async (id, members) => {
        const state = await requireMember(id);
        if (state.conversation.type === "im") {
          throw new TeamChatError("invalid_target", "cannot invite into a DM");
        }
        await insertMembers(id, members);
      },
      join: async (id) => {
        if (!userId) {
          throw new TeamChatError("not_allowed", "requires a user context");
        }
        const conversation = await getConversationRow(id);
        if (conversation.type !== "public_channel") {
          throw new TeamChatError("not_allowed", "join is for public channels");
        }
        await insertMembers(id, [
          { principal_id: userId, principal_type: "user" },
        ]);
      },
      kick: async (id, member) => {
        const state = await requireMember(id);
        if (state.conversation.type === "im") {
          throw new TeamChatError("invalid_target", "cannot kick from a DM");
        }
        const { error } = await membersTbl()
          .delete()
          .eq("conversation_id", id)
          .eq("principal_type", member.principal_type)
          .eq(
            "principal_id",
            member.principal_type === "user"
              ? member.principal_id.toLowerCase()
              : member.principal_id
          );
        if (error) {
          throw new Error(`team-chat kick failed: ${error.message}`);
        }
      },
      leave: async (id) => {
        if (!userId) {
          throw new TeamChatError("not_allowed", "requires a user context");
        }
        const conversation = await getConversationRow(id);
        if (conversation.type === "im") {
          throw new TeamChatError("invalid_target", "cannot leave a DM");
        }
        const { error } = await membersTbl()
          .delete()
          .eq("conversation_id", id)
          .eq("principal_type", "user")
          .eq("principal_id", userId);
        if (error) {
          throw new Error(`team-chat leave failed: ${error.message}`);
        }
      },
      listForCaller,
      mark: async (id, ts) => {
        if (!userId) {
          throw new TeamChatError("not_allowed", "requires a user context");
        }
        await requireMember(id);
        const { error } = await membersTbl()
          .update({ last_read_ts: ts, updated_at: new Date().toISOString() })
          .eq("conversation_id", id)
          .eq("principal_type", "user")
          .eq("principal_id", userId);
        if (error) {
          throw new Error(`team-chat mark failed: ${error.message}`);
        }
      },
      members: async (id) => {
        await requireReadable(id);
        const { data, error } = await membersTbl()
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: true });
        if (error) {
          throw new Error(`team-chat members failed: ${error.message}`);
        }
        return ((data ?? []) as Record<string, unknown>[]).map(rowToMember);
      },
      openDm,
      rename: async (id, name) => {
        const state = await requireMember(id);
        if (
          state.conversation.type === "im" ||
          state.conversation.type === "mpim"
        ) {
          throw new TeamChatError("invalid_target", "DMs have no name");
        }
        return updateConversation(id, { name });
      },
      setPurpose: async (id, purpose) => {
        await requireMember(id);
        return updateConversation(id, { purpose });
      },
      setTopic: async (id, topic) => {
        await requireMember(id);
        return updateConversation(id, { topic });
      },
    },
    membership,
    messages: {
      history,
      post,
      replies,
      search,
      softDelete,
      update,
    },
    pins: {
      add: async (conversationId, ts) => {
        if (!userId) {
          throw new TeamChatError("not_allowed", "requires a user context");
        }
        await requireMember(conversationId);
        await requireMessage(conversationId, ts);
        const { error } = await pinsTbl().upsert(
          {
            conversation_id: conversationId,
            message_ts: ts,
            pinned_by: userId,
            tenant_id: tenantId,
          },
          { ignoreDuplicates: true, onConflict: "conversation_id,message_ts" }
        );
        if (error) {
          throw new Error(`team-chat pin failed: ${error.message}`);
        }
      },
      list: listPins,
      remove: async (conversationId, ts) => {
        await requireMember(conversationId);
        const { error } = await pinsTbl()
          .delete()
          .eq("conversation_id", conversationId)
          .eq("message_ts", ts);
        if (error) {
          throw new Error(`team-chat unpin failed: ${error.message}`);
        }
      },
    },
    reactions: {
      add: (conversationId, ts, emoji) =>
        mutateReaction("add", conversationId, ts, emoji),
      get: async (conversationId, ts) => {
        await requireReadable(conversationId);
        const row = await getMessageRow(conversationId, ts);
        const [message] = await attachReactions(conversationId, [
          rowToMessage(row),
        ]);
        return message?.reactions ?? [];
      },
      remove: (conversationId, ts, emoji) =>
        mutateReaction("remove", conversationId, ts, emoji),
    },
  };
}
