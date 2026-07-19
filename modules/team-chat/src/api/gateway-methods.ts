import type {
  PluginAuthContext,
  PluginServerApi,
  QueueServiceLike,
} from "@engenty/plugin-sdk";
import type { TeamChatRepo } from "../dal/contracts.js";
import { extractMentions } from "../lib/mentions.js";
import {
  activityFeedInputSchema,
  activityFeedResultSchema,
  bindProjectInputSchema,
  channelRefInputSchema,
  conversationResultSchema,
  conversationsCreateInputSchema,
  conversationsHistoryInputSchema,
  conversationsInfoInputSchema,
  conversationsInfoResultSchema,
  conversationsInviteInputSchema,
  conversationsKickInputSchema,
  conversationsListInputSchema,
  conversationsListResultSchema,
  conversationsMarkInputSchema,
  conversationsMembersInputSchema,
  conversationsMembersResultSchema,
  conversationsOpenInputSchema,
  conversationsRenameInputSchema,
  conversationsRepliesInputSchema,
  conversationsSetPurposeInputSchema,
  conversationsSetTopicInputSchema,
  deleteMessageInputSchema,
  messageResultSchema,
  okResultSchema,
  paginatedMessagesResultSchema,
  pinsListInputSchema,
  pinsListResultSchema,
  pinsMutateInputSchema,
  postAsAgentInputSchema,
  postMessageInputSchema,
  projectChannelGetInputSchema,
  projectChannelResultSchema,
  reactionsGetInputSchema,
  reactionsGetResultSchema,
  reactionsMutateInputSchema,
  searchMessagesInputSchema,
  searchMessagesResultSchema,
  updateMessageInputSchema,
  updateSettingsInputSchema,
} from "../schema/zod.js";
import { enqueueAgentMentions } from "./agent-mention-queue.js";

const MODULE_ID = "team-chat";
const READ = ["module.team-chat.read"];
const WRITE = ["module.team-chat.write"];
const MANAGE = ["module.team-chat.manage"];

export interface RegisterTeamChatGatewayMethodsOptions {
  queue?: QueueServiceLike | null;
  repoForAuth: (auth: PluginAuthContext | undefined) => TeamChatRepo;
}

export function registerTeamChatGatewayMethods(
  api: PluginServerApi,
  options: RegisterTeamChatGatewayMethodsOptions
) {
  const { repoForAuth } = options;
  const queue = options.queue ?? null;

  api.registerOperation({
    operationId: "team_chat_conversations_list",
    moduleId: MODULE_ID,
    summary:
      "List the caller's team-chat conversations (channels + DMs) with unread counts; include_public adds unjoined public channels",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: conversationsListInputSchema.optional(),
    outputSchema: conversationsListResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsListInputSchema.parse(input ?? {});
      const repo = repoForAuth(ctx.auth);
      const conversations = await repo.conversations.listForCaller({
        includeArchived: parsed.include_archived,
        includePublic: parsed.include_public,
      });
      return { conversations, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_info",
    moduleId: MODULE_ID,
    summary:
      "Get one team-chat conversation with the caller's membership state",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: conversationsInfoInputSchema,
    outputSchema: conversationsInfoResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsInfoInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const conversation = await repo.conversations.getForCaller(
        parsed.channel
      );
      if (!conversation) {
        throw new Error("channel_not_found");
      }
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_create",
    moduleId: MODULE_ID,
    summary: "Create a team-chat channel (public or private)",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: conversationsCreateInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsCreateInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const conversation = await repo.conversations.createChannel(parsed);
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_open",
    moduleId: MODULE_ID,
    summary: "Open (find or create) a DM or group DM with the given users",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: conversationsOpenInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsOpenInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const conversation = await repo.conversations.openDm(parsed.user_ids);
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_join",
    moduleId: MODULE_ID,
    summary: "Join a public team-chat channel",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: channelRefInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = channelRefInputSchema.parse(input);
      await repoForAuth(ctx.auth).conversations.join(parsed.channel);
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_leave",
    moduleId: MODULE_ID,
    summary: "Leave a team-chat channel",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: channelRefInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = channelRefInputSchema.parse(input);
      await repoForAuth(ctx.auth).conversations.leave(parsed.channel);
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_invite",
    moduleId: MODULE_ID,
    summary: "Invite users or agents into a team-chat conversation",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: conversationsInviteInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsInviteInputSchema.parse(input);
      await repoForAuth(ctx.auth).conversations.invite(
        parsed.channel,
        parsed.members
      );
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_kick",
    moduleId: MODULE_ID,
    summary: "Remove a member from a team-chat conversation",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: conversationsKickInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsKickInputSchema.parse(input);
      await repoForAuth(ctx.auth).conversations.kick(
        parsed.channel,
        parsed.member
      );
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_archive",
    moduleId: MODULE_ID,
    summary: "Archive a team-chat channel",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: channelRefInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = channelRefInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.archive(
        parsed.channel,
        true
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_unarchive",
    moduleId: MODULE_ID,
    summary: "Unarchive a team-chat channel",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: channelRefInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = channelRefInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.archive(
        parsed.channel,
        false
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_rename",
    moduleId: MODULE_ID,
    summary: "Rename a team-chat channel",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: conversationsRenameInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsRenameInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.rename(
        parsed.channel,
        parsed.name
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_set_topic",
    moduleId: MODULE_ID,
    summary: "Set the topic of a team-chat conversation",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: conversationsSetTopicInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsSetTopicInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.setTopic(
        parsed.channel,
        parsed.topic
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_set_purpose",
    moduleId: MODULE_ID,
    summary: "Set the purpose of a team-chat conversation",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: conversationsSetPurposeInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsSetPurposeInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.setPurpose(
        parsed.channel,
        parsed.purpose
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_members",
    moduleId: MODULE_ID,
    summary: "List the members of a team-chat conversation",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: conversationsMembersInputSchema,
    outputSchema: conversationsMembersResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsMembersInputSchema.parse(input);
      const members = await repoForAuth(ctx.auth).conversations.members(
        parsed.channel
      );
      return { members, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_mark",
    moduleId: MODULE_ID,
    summary:
      "Set the caller's read cursor in a conversation (conversations.mark)",
    requiredCapabilities: READ,
    riskLevel: "low",
    inputSchema: conversationsMarkInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsMarkInputSchema.parse(input);
      await repoForAuth(ctx.auth).conversations.mark(parsed.channel, parsed.ts);
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_history",
    moduleId: MODULE_ID,
    summary:
      "Fetch a conversation's root messages, newest first (conversations.history)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: conversationsHistoryInputSchema,
    outputSchema: paginatedMessagesResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsHistoryInputSchema.parse(input);
      return repoForAuth(ctx.auth).messages.history({
        conversationId: parsed.channel,
        cursor: parsed.cursor,
        inclusive: parsed.inclusive,
        latest: parsed.latest,
        limit: parsed.limit,
        oldest: parsed.oldest,
      });
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_replies",
    moduleId: MODULE_ID,
    summary:
      "Fetch a thread: the parent message and its replies (conversations.replies)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: conversationsRepliesInputSchema,
    outputSchema: paginatedMessagesResultSchema,
    handler: async (input, ctx) => {
      const parsed = conversationsRepliesInputSchema.parse(input);
      return repoForAuth(ctx.auth).messages.replies({
        conversationId: parsed.channel,
        cursor: parsed.cursor,
        limit: parsed.limit,
        threadTs: parsed.ts,
      });
    },
  });

  api.registerOperation({
    operationId: "team_chat_post_message",
    moduleId: MODULE_ID,
    summary: "Post a message to a team-chat conversation (chat.postMessage)",
    requiredCapabilities: WRITE,
    riskLevel: "medium",
    inputSchema: postMessageInputSchema,
    outputSchema: messageResultSchema,
    handler: async (input, ctx) => {
      const parsed = postMessageInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const mentions = extractMentions(parsed.text);
      const message = await repo.messages.post({
        blocks: parsed.blocks,
        conversationId: parsed.channel,
        files: parsed.files,
        mentions,
        metadata: parsed.metadata,
        text: parsed.text,
        threadTs: parsed.thread_ts,
      });
      // @-mentioned agents answer via the apps/ai mention consumer (§7.3).
      // Dispatch is best-effort: a queue hiccup must never fail the post.
      if (ctx.auth?.tenantId) {
        try {
          await enqueueAgentMentions(queue, {
            conversationId: parsed.channel,
            mentions,
            messageTs: message.ts,
            tenantId: ctx.auth.tenantId,
            threadTs: message.thread_ts,
          });
        } catch (err) {
          ctx.logger?.warn?.("team-chat agent mention enqueue failed", {
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { message, ok: true as const, ts: message.ts };
    },
  });

  api.registerOperation({
    operationId: "team_chat_post_as_agent",
    moduleId: MODULE_ID,
    summary:
      "Post a channel message authored by an agent (member agents, or public channels); optionally links the thread to the agent's ai.thread",
    requiredCapabilities: WRITE,
    riskLevel: "medium",
    inputSchema: postAsAgentInputSchema,
    outputSchema: messageResultSchema,
    handler: async (input, ctx) => {
      const parsed = postAsAgentInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const threadTs = parsed.thread_ts;
      const message = await repo.messages.post({
        agentTypeKey: parsed.agent_type_key,
        conversationId: parsed.channel,
        mentions: extractMentions(parsed.text),
        metadata: {
          ...(parsed.metadata ?? {}),
          ...(parsed.ai_thread_id
            ? {
                event_payload: { ai_thread_id: parsed.ai_thread_id },
                event_type: "agent_response",
              }
            : {}),
        },
        text: parsed.text,
        ...(threadTs ? { threadTs } : {}),
      });
      if (parsed.ai_thread_id) {
        await repo.agentThreads.link({
          agentTypeKey: parsed.agent_type_key,
          aiThreadId: parsed.ai_thread_id,
          conversationId: parsed.channel,
          threadTs: threadTs ?? message.ts,
        });
      }
      return { message, ok: true as const, ts: message.ts };
    },
  });

  api.registerOperation({
    operationId: "team_chat_update_message",
    moduleId: MODULE_ID,
    summary: "Edit a team-chat message you authored (chat.update)",
    requiredCapabilities: WRITE,
    riskLevel: "medium",
    inputSchema: updateMessageInputSchema,
    outputSchema: messageResultSchema,
    handler: async (input, ctx) => {
      const parsed = updateMessageInputSchema.parse(input);
      const message = await repoForAuth(ctx.auth).messages.update(
        parsed.channel,
        parsed.ts,
        { blocks: parsed.blocks, text: parsed.text }
      );
      return { message, ok: true as const, ts: message.ts };
    },
  });

  api.registerOperation({
    operationId: "team_chat_reactions_add",
    moduleId: MODULE_ID,
    summary: "Add an emoji reaction to a team-chat message (reactions.add)",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: reactionsMutateInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = reactionsMutateInputSchema.parse(input);
      await repoForAuth(ctx.auth).reactions.add(
        parsed.channel,
        parsed.timestamp,
        parsed.name
      );
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_reactions_remove",
    moduleId: MODULE_ID,
    summary:
      "Remove your emoji reaction from a team-chat message (reactions.remove)",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: reactionsMutateInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = reactionsMutateInputSchema.parse(input);
      await repoForAuth(ctx.auth).reactions.remove(
        parsed.channel,
        parsed.timestamp,
        parsed.name
      );
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_reactions_get",
    moduleId: MODULE_ID,
    summary: "Get the reactions on a team-chat message (reactions.get)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: reactionsGetInputSchema,
    outputSchema: reactionsGetResultSchema,
    handler: async (input, ctx) => {
      const parsed = reactionsGetInputSchema.parse(input);
      const reactions = await repoForAuth(ctx.auth).reactions.get(
        parsed.channel,
        parsed.timestamp
      );
      return { ok: true as const, reactions };
    },
  });

  api.registerOperation({
    operationId: "team_chat_pins_add",
    moduleId: MODULE_ID,
    summary: "Pin a message in a team-chat conversation (pins.add)",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: pinsMutateInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = pinsMutateInputSchema.parse(input);
      await repoForAuth(ctx.auth).pins.add(parsed.channel, parsed.timestamp);
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_pins_remove",
    moduleId: MODULE_ID,
    summary: "Unpin a message in a team-chat conversation (pins.remove)",
    requiredCapabilities: WRITE,
    riskLevel: "low",
    inputSchema: pinsMutateInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = pinsMutateInputSchema.parse(input);
      await repoForAuth(ctx.auth).pins.remove(parsed.channel, parsed.timestamp);
      return { ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_pins_list",
    moduleId: MODULE_ID,
    summary: "List the pinned messages of a team-chat conversation (pins.list)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: pinsListInputSchema,
    outputSchema: pinsListResultSchema,
    handler: async (input, ctx) => {
      const parsed = pinsListInputSchema.parse(input);
      const pins = await repoForAuth(ctx.auth).pins.list(parsed.channel);
      return { ok: true as const, pins };
    },
  });

  api.registerOperation({
    operationId: "team_chat_project_channel_get",
    moduleId: MODULE_ID,
    summary: "Get the channel bound to a project (null when none)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: projectChannelGetInputSchema,
    outputSchema: projectChannelResultSchema,
    handler: async (input, ctx) => {
      const parsed = projectChannelGetInputSchema.parse(input);
      const conversation = await repoForAuth(
        ctx.auth
      ).conversations.findByProject(parsed.project_id);
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_conversations_update_settings",
    moduleId: MODULE_ID,
    summary: "Shallow-merge conversation settings (e.g. activity feed opt-out)",
    requiredCapabilities: MANAGE,
    riskLevel: "low",
    inputSchema: updateSettingsInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = updateSettingsInputSchema.parse(input);
      const repo = repoForAuth(ctx.auth);
      const conversation = await repo.conversations.updateSettings(
        parsed.channel,
        parsed.settings
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_bind_project",
    moduleId: MODULE_ID,
    summary:
      "Bind a channel to a project (project tab + activity feed); null unbinds",
    requiredCapabilities: MANAGE,
    riskLevel: "medium",
    inputSchema: bindProjectInputSchema,
    outputSchema: conversationResultSchema,
    handler: async (input, ctx) => {
      const parsed = bindProjectInputSchema.parse(input);
      const conversation = await repoForAuth(ctx.auth).conversations.setProject(
        parsed.channel,
        parsed.project_id
      );
      return { conversation, ok: true as const };
    },
  });

  api.registerOperation({
    operationId: "team_chat_search_messages",
    moduleId: MODULE_ID,
    summary:
      "Full-text search over team-chat messages the caller can see (search.messages)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: searchMessagesInputSchema,
    outputSchema: searchMessagesResultSchema,
    handler: async (input, ctx) => {
      const parsed = searchMessagesInputSchema.parse(input);
      return repoForAuth(ctx.auth).messages.search(parsed.query, parsed.limit);
    },
  });

  api.registerOperation({
    operationId: "team_chat_activity_feed",
    moduleId: MODULE_ID,
    summary:
      "Dashboard feed for the caller: recent mentions of them plus threads they participate in (activity.feed)",
    requiredCapabilities: READ,
    riskLevel: "low",
    idempotent: true,
    inputSchema: activityFeedInputSchema,
    outputSchema: activityFeedResultSchema,
    handler: async (input, ctx) => {
      const parsed = activityFeedInputSchema.parse(input);
      return repoForAuth(ctx.auth).messages.activityFeed(parsed.limit);
    },
  });

  api.registerOperation({
    operationId: "team_chat_delete_message",
    moduleId: MODULE_ID,
    summary:
      "Delete a team-chat message (author or channel owner; soft delete, chat.delete)",
    requiredCapabilities: WRITE,
    riskLevel: "medium",
    inputSchema: deleteMessageInputSchema,
    outputSchema: okResultSchema,
    handler: async (input, ctx) => {
      const parsed = deleteMessageInputSchema.parse(input);
      await repoForAuth(ctx.auth).messages.softDelete(
        parsed.channel,
        parsed.ts
      );
      return { ok: true as const };
    },
  });
}
