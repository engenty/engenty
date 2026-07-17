import { z } from "@hono/zod-openapi";

export const conversationTypeSchema = z.enum([
  "public_channel",
  "private_channel",
  "im",
  "mpim",
]);

export const memberPrincipalTypeSchema = z.enum(["user", "agent"]);

export const memberPrincipalSchema = z.object({
  principal_id: z.string(),
  principal_type: memberPrincipalTypeSchema,
});

export const conversationSchema = z.object({
  created_at: z.string(),
  created_by: z.string().nullable(),
  id: z.string(),
  is_archived: z.boolean(),
  name: z.string().nullable(),
  project_id: z.string().nullable(),
  purpose: z.string().nullable(),
  scope_id: z.string(),
  settings: z.record(z.string(), z.unknown()),
  tenant_id: z.string(),
  topic: z.string().nullable(),
  type: conversationTypeSchema,
  updated_at: z.string(),
});

export const conversationLastMessageSchema = z.object({
  agent_type_key: z.string().nullable(),
  subtype: z.string().nullable(),
  text: z.string(),
  ts: z.string(),
  user_id: z.string().nullable(),
});

export const conversationListItemSchema = conversationSchema.extend({
  is_member: z.boolean(),
  last_message: conversationLastMessageSchema.nullable(),
  last_read_ts: z.string().nullable(),
  member_role: z.enum(["owner", "member"]).nullable(),
  members: z.array(memberPrincipalSchema),
  mention_count: z.number(),
  muted: z.boolean(),
  unread_count: z.number(),
});

export const conversationMemberSchema = z.object({
  conversation_id: z.string(),
  created_at: z.string(),
  id: z.string(),
  last_read_ts: z.string().nullable(),
  muted: z.boolean(),
  principal_id: z.string(),
  principal_type: memberPrincipalTypeSchema,
  role: z.enum(["owner", "member"]),
});

/** Slack reaction aggregate: `name` is the emoji (unicode; bridge maps to shortcodes). */
export const reactionAggregateSchema = z.object({
  count: z.number(),
  name: z.string(),
  users: z.array(z.string()),
});

export const messageSchema = z.object({
  agent_type_key: z.string().nullable(),
  attachments: z.array(z.record(z.string(), z.unknown())),
  blocks: z.array(z.record(z.string(), z.unknown())),
  bot_id: z.string().nullable(),
  conversation_id: z.string(),
  created_at: z.string(),
  deleted: z.boolean(),
  edited: z.object({ ts: z.string(), user: z.string() }).nullable(),
  files: z.array(z.record(z.string(), z.unknown())),
  latest_reply: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  reactions: z.array(reactionAggregateSchema),
  reply_count: z.number(),
  reply_users: z.array(z.string()),
  subtype: z.string().nullable(),
  text: z.string(),
  thread_ts: z.string().nullable(),
  ts: z.string(),
  updated_at: z.string(),
  user_id: z.string().nullable(),
});

// ── Operation inputs / outputs (Slack Web API shapes) ───────────────────────

export const conversationsListInputSchema = z.object({
  include_archived: z.boolean().optional(),
  // When true, also list public channels the caller has not joined (browse).
  include_public: z.boolean().optional(),
});

export const conversationsListResultSchema = z.object({
  conversations: z.array(conversationListItemSchema),
  ok: z.literal(true),
});

export const conversationsInfoInputSchema = z.object({
  channel: z.string(),
});

export const conversationsInfoResultSchema = z.object({
  conversation: conversationListItemSchema,
  ok: z.literal(true),
});

export const conversationsCreateInputSchema = z.object({
  is_private: z.boolean().optional(),
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "channel_name_invalid"),
  purpose: z.string().max(500).optional(),
  topic: z.string().max(500).optional(),
});

export const conversationsOpenInputSchema = z.object({
  // Peer users (the caller is included implicitly). Agents are rejected in
  // v1 — agent DMs are deferred until the object-widgets work lands.
  user_ids: z.array(z.string()).min(1).max(8),
});

export const conversationResultSchema = z.object({
  conversation: conversationSchema,
  ok: z.literal(true),
});

export const channelRefInputSchema = z.object({
  channel: z.string(),
});

export const conversationsInviteInputSchema = z.object({
  channel: z.string(),
  members: z.array(memberPrincipalSchema).min(1).max(50),
});

export const conversationsKickInputSchema = z.object({
  channel: z.string(),
  member: memberPrincipalSchema,
});

export const conversationsRenameInputSchema = z.object({
  channel: z.string(),
  name: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "channel_name_invalid"),
});

export const conversationsSetTopicInputSchema = z.object({
  channel: z.string(),
  topic: z.string().max(500),
});

export const conversationsSetPurposeInputSchema = z.object({
  channel: z.string(),
  purpose: z.string().max(500),
});

export const conversationsMarkInputSchema = z.object({
  channel: z.string(),
  ts: z.string(),
});

export const conversationsMembersInputSchema = z.object({
  channel: z.string(),
});

export const conversationsMembersResultSchema = z.object({
  members: z.array(conversationMemberSchema),
  ok: z.literal(true),
});

export const conversationsHistoryInputSchema = z.object({
  channel: z.string(),
  cursor: z.string().optional(),
  inclusive: z.boolean().optional(),
  latest: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  oldest: z.string().optional(),
});

export const paginatedMessagesResultSchema = z.object({
  has_more: z.boolean(),
  messages: z.array(messageSchema),
  ok: z.literal(true),
  response_metadata: z.object({ next_cursor: z.string().nullable() }),
});

export const conversationsRepliesInputSchema = z.object({
  channel: z.string(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  ts: z.string(),
});

export const postMessageInputSchema = z.object({
  blocks: z.array(z.record(z.string(), z.unknown())).optional(),
  channel: z.string(),
  files: z.array(z.record(z.string(), z.unknown())).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  text: z.string().max(40_000),
  thread_ts: z.string().optional(),
});

export const messageResultSchema = z.object({
  message: messageSchema,
  ok: z.literal(true),
  ts: z.string(),
});

export const updateMessageInputSchema = z.object({
  blocks: z.array(z.record(z.string(), z.unknown())).optional(),
  channel: z.string(),
  text: z.string().max(40_000),
  ts: z.string(),
});

export const deleteMessageInputSchema = z.object({
  channel: z.string(),
  ts: z.string(),
});

export const okResultSchema = z.object({
  ok: z.literal(true),
});

// ── Phase 2: reactions / pins / search ───────────────────────────────────────

export const reactionsMutateInputSchema = z.object({
  channel: z.string(),
  // Unicode emoji (Slack sends shortcodes; the bridge converts).
  name: z.string().min(1).max(80),
  timestamp: z.string(),
});

export const reactionsGetInputSchema = z.object({
  channel: z.string(),
  timestamp: z.string(),
});

export const reactionsGetResultSchema = z.object({
  ok: z.literal(true),
  reactions: z.array(reactionAggregateSchema),
});

export const pinsMutateInputSchema = z.object({
  channel: z.string(),
  timestamp: z.string(),
});

export const pinsListInputSchema = z.object({
  channel: z.string(),
});

export const pinsListResultSchema = z.object({
  ok: z.literal(true),
  pins: z.array(
    z.object({
      created_at: z.string(),
      message: messageSchema.nullable(),
      message_ts: z.string(),
      pinned_by: z.string().nullable(),
    })
  ),
});

export const searchMessagesInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  query: z.string().min(2).max(200),
});

export const searchMessagesResultSchema = z.object({
  messages: z.array(
    messageSchema.extend({ conversation_name: z.string().nullable() })
  ),
  ok: z.literal(true),
  total: z.number(),
});
