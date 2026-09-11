// Team-chat AI surface — tools that let any agent read and post to channels.
// Tools delegate to registered operations (capability gating + audit for free)
// and never touch the DB. Agent posts always carry agent authorship (§9).
import type { AiRegistration } from "@engenty/ai-core";
import { defineModuleAi } from "@engenty/ai-core";
import type { PluginServerGatewayCaller } from "@engenty/plugin-sdk";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface TeamChatAiOptions {
  invokeTeamChatOperation: PluginServerGatewayCaller["invokeOperation"];
}

const TEAM_CHAT_LIST_CHANNELS_TOOL_ID = "team_chat_list_channels";
const TEAM_CHAT_READ_THREAD_TOOL_ID = "team_chat_read_thread";
const TEAM_CHAT_POST_TOOL_ID = "team_chat_post";

function defineTeamChatAi(options: TeamChatAiOptions) {
  const invoke = options.invokeTeamChatOperation;
  return defineModuleAi({
    dir: import.meta.url,
    moduleId: "team-chat",
    tools: {
      [TEAM_CHAT_LIST_CHANNELS_TOOL_ID]: createTool({
        id: TEAM_CHAT_LIST_CHANNELS_TOOL_ID,
        description:
          "List team-chat conversations (channels and DMs) visible to the current principal, with unread state. Use include_public to also see unjoined public channels.",
        inputSchema: z.object({
          include_public: z.boolean().optional(),
        }),
        execute: async ({ include_public }) =>
          invoke("team_chat_conversations_list", {
            include_public: include_public ?? true,
          }),
      }),
      [TEAM_CHAT_READ_THREAD_TOOL_ID]: createTool({
        id: TEAM_CHAT_READ_THREAD_TOOL_ID,
        description:
          "Read team-chat messages: the recent history of a conversation (by channel id), or one thread when thread_ts is given.",
        inputSchema: z.object({
          channel: z.string().meta({ description: "Conversation id" }),
          limit: z.number().int().min(1).max(100).optional(),
          thread_ts: z.string().optional().meta({
            description: "Root message ts — reads that thread's replies",
          }),
        }),
        execute: async ({ channel, limit, thread_ts }) =>
          thread_ts
            ? invoke("team_chat_conversations_replies", {
                channel,
                limit: limit ?? 50,
                ts: thread_ts,
              })
            : invoke("team_chat_conversations_history", {
                channel,
                limit: limit ?? 50,
              }),
      }),
      [TEAM_CHAT_POST_TOOL_ID]: createTool({
        id: TEAM_CHAT_POST_TOOL_ID,
        description:
          "Post a message to a team-chat conversation AS YOURSELF (the agent). Pass your own agent type key as agent_type_key — posts are always agent-authored, never impersonate a user. Use thread_ts to reply in a thread. Mention users with <@u:USER_UUID>.",
        inputSchema: z.object({
          agent_type_key: z.string().meta({
            description: "Your own agent type key (authorship)",
          }),
          channel: z.string(),
          text: z.string().min(1).max(40_000),
          thread_ts: z.string().optional(),
        }),
        execute: async ({ agent_type_key, channel, text, thread_ts }) =>
          invoke("team_chat_post_as_agent", {
            agent_type_key,
            channel,
            text,
            ...(thread_ts ? { thread_ts } : {}),
          }),
      }),
    },
  });
}

export function teamChatAiRegistration(
  options: TeamChatAiOptions
): AiRegistration {
  return defineTeamChatAi(options).aiRegistration();
}
