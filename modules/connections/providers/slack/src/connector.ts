import {
  type ConnectorAction,
  type ConnectorActionContext,
  defineConnector,
} from "@engenty/connections-sdk";
import { z } from "zod";

/**
 * Every user scope the Slack connector's actions need. Slack's OAuth v2
 * user-token flow expects USER scopes in the `user_scope` query parameter —
 * the `scope` parameter is reserved for BOT scopes. The generic SDK
 * (`buildAuthorizationUrl`) only writes into `scope`, so:
 *
 * - `baseScopes` and every action's `providerScopes` are deliberately `[]`
 *   (an empty `scope` param means "no bot scopes", which is what we want), and
 * - the full user scope set is passed statically via
 *   `extraAuthParams.user_scope` instead of incrementally per action group.
 */
export const SLACK_USER_SCOPES = [
  "channels:read",
  "groups:read",
  "channels:history",
  "groups:history",
  "search:read",
  "chat:write",
  "reactions:write",
  "users:read",
] as const;

const SLACK_API_BASE = "https://slack.com/api";

interface SlackApiEnvelope {
  error?: string;
  ok: boolean;
}

/**
 * Call a Slack Web API method. Slack returns HTTP 200 with
 * `{ ok: false, error }` on application-level failures, so both the HTTP
 * status and the body's `ok` flag must be checked.
 */
async function slackApi<T extends SlackApiEnvelope>(
  ctx: ConnectorActionContext,
  method: string,
  params: Record<string, string | number | boolean | undefined> = {}
): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, String(value));
    }
  }
  const response = await ctx.fetchImpl(`${SLACK_API_BASE}/${method}`, {
    body,
    headers: {
      authorization: `Bearer ${ctx.accessToken}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`slack_http_error: ${method} returned ${response.status}`);
  }
  const data = (await response.json()) as T;
  if (!data.ok) {
    throw new Error(`slack_api_error: ${data.error ?? "unknown_error"}`);
  }
  return data;
}

interface SlackChannel {
  id: string;
  is_private?: boolean;
  name?: string;
  num_members?: number;
  topic?: { value?: string };
}

interface SlackMessage {
  reply_count?: number;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  ts: string;
  user?: string;
}

interface SlackSearchMatch {
  channel?: { name?: string };
  permalink?: string;
  text?: string;
  ts?: string;
  user?: string;
  username?: string;
}

interface SlackUser {
  deleted?: boolean;
  id: string;
  is_bot?: boolean;
  name?: string;
  real_name?: string;
}

function mapMessage(message: SlackMessage) {
  return {
    reply_count: message.reply_count ?? 0,
    subtype: message.subtype ?? null,
    text: message.text ?? "",
    thread_ts: message.thread_ts ?? null,
    ts: message.ts,
    user: message.user ?? null,
  };
}

const listChannelsInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of channels to return (1-50, default 50)."),
});

const getChannelHistoryInput = z.object({
  channel: z
    .string()
    .describe("Channel ID to fetch history for (e.g. C0123456789)."),
  latest: z
    .string()
    .optional()
    .describe("Only messages before this Slack timestamp (exclusive)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of messages to return (1-25, default 25)."),
  oldest: z
    .string()
    .optional()
    .describe("Only messages after this Slack timestamp (exclusive)."),
});

const getThreadRepliesInput = z.object({
  channel: z.string().describe("Channel ID the thread lives in."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of replies to return (1-25, default 25)."),
  thread_ts: z
    .string()
    .describe(
      "Timestamp of the thread's parent message (e.g. 1712345678.000100)."
    ),
});

const searchMessagesInput = z.object({
  count: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .describe("Maximum number of matches to return (1-25, default 25)."),
  query: z
    .string()
    .describe(
      "Search query; supports Slack search modifiers like in:#channel or from:@user."
    ),
});

const listUsersInput = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of users to return (1-50, default 50)."),
});

const postMessageInput = z.object({
  channel: z
    .string()
    .describe("Channel ID (or user ID for a DM) to post the message to."),
  text: z.string().describe("Message text (Slack mrkdwn)."),
  thread_ts: z
    .string()
    .optional()
    .describe(
      "Parent message timestamp to reply in a thread instead of the channel."
    ),
});

const updateMessageInput = z.object({
  channel: z.string().describe("Channel ID containing the message to update."),
  text: z.string().describe("New message text (replaces the previous text)."),
  ts: z.string().describe("Timestamp of the message to update."),
});

const addReactionInput = z.object({
  channel: z
    .string()
    .describe("Channel ID containing the message to react to."),
  emoji: z
    .string()
    .describe("Emoji name without colons (e.g. thumbsup, white_check_mark)."),
  ts: z.string().describe("Timestamp of the message to react to."),
});

// Per-action providerScopes are [] on purpose — see SLACK_USER_SCOPES above:
// Slack user scopes are requested via extraAuthParams.user_scope, not through
// the SDK's incremental `scope` machinery (which would send them as bot scopes).
const actions: ConnectorAction[] = [
  {
    description:
      "List public and private Slack channels the connected user can see, excluding archived ones.",
    group: "read",
    handler: async (input, ctx) => {
      const args = listChannelsInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { channels?: SlackChannel[] }
      >(ctx, "conversations.list", {
        exclude_archived: true,
        limit: args.limit ?? 50,
        types: "public_channel,private_channel",
      });
      return {
        channels: (data.channels ?? []).map((channel) => ({
          id: channel.id,
          is_private: channel.is_private ?? false,
          name: channel.name ?? "",
          num_members: channel.num_members ?? 0,
          topic: channel.topic?.value ?? "",
        })),
      };
    },
    id: "list_channels",
    inputSchema: listChannelsInput,
    providerScopes: [],
    summary: "List Slack channels",
  },
  {
    description: "Fetch recent messages from a Slack channel, newest first.",
    group: "read",
    handler: async (input, ctx) => {
      const args = getChannelHistoryInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { messages?: SlackMessage[] }
      >(ctx, "conversations.history", {
        channel: args.channel,
        latest: args.latest,
        limit: args.limit ?? 25,
        oldest: args.oldest,
      });
      return { messages: (data.messages ?? []).map(mapMessage) };
    },
    id: "get_channel_history",
    inputSchema: getChannelHistoryInput,
    providerScopes: [],
    summary: "Get Slack channel history",
  },
  {
    description:
      "Fetch the replies of a Slack thread (including the parent message).",
    group: "read",
    handler: async (input, ctx) => {
      const args = getThreadRepliesInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { messages?: SlackMessage[] }
      >(ctx, "conversations.replies", {
        channel: args.channel,
        limit: args.limit ?? 25,
        ts: args.thread_ts,
      });
      return { messages: (data.messages ?? []).map(mapMessage) };
    },
    id: "get_thread_replies",
    inputSchema: getThreadRepliesInput,
    providerScopes: [],
    summary: "Get Slack thread replies",
  },
  {
    description:
      "Search messages across the Slack workspace as the connected user.",
    group: "read",
    handler: async (input, ctx) => {
      const args = searchMessagesInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { messages?: { matches?: SlackSearchMatch[] } }
      >(ctx, "search.messages", {
        count: args.count ?? 25,
        query: args.query,
      });
      return {
        matches: (data.messages?.matches ?? []).map((match) => ({
          channel: match.channel?.name ?? "",
          permalink: match.permalink ?? "",
          text: match.text ?? "",
          ts: match.ts ?? "",
          user: match.user ?? match.username ?? null,
        })),
      };
    },
    id: "search_messages",
    inputSchema: searchMessagesInput,
    providerScopes: [],
    summary: "Search Slack messages",
  },
  {
    description: "List workspace members (deactivated accounts are skipped).",
    group: "read",
    handler: async (input, ctx) => {
      const args = listUsersInput.parse(input);
      const data = await slackApi<SlackApiEnvelope & { members?: SlackUser[] }>(
        ctx,
        "users.list",
        { limit: args.limit ?? 50 }
      );
      return {
        users: (data.members ?? [])
          .filter((member) => !member.deleted)
          .map((member) => ({
            id: member.id,
            is_bot: member.is_bot ?? false,
            name: member.name ?? "",
            real_name: member.real_name ?? "",
          })),
      };
    },
    id: "list_users",
    inputSchema: listUsersInput,
    providerScopes: [],
    summary: "List Slack users",
  },
  {
    description:
      "Post a message to a Slack channel (or as a thread reply) as the connected user.",
    group: "write",
    handler: async (input, ctx) => {
      const args = postMessageInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { channel?: string; ts?: string }
      >(ctx, "chat.postMessage", {
        channel: args.channel,
        text: args.text,
        thread_ts: args.thread_ts,
      });
      return { channel: data.channel ?? args.channel, ts: data.ts ?? "" };
    },
    id: "post_message",
    inputSchema: postMessageInput,
    providerScopes: [],
    summary: "Post a Slack message",
  },
  {
    description: "Update the text of a previously posted Slack message.",
    group: "write",
    handler: async (input, ctx) => {
      const args = updateMessageInput.parse(input);
      const data = await slackApi<
        SlackApiEnvelope & { channel?: string; ts?: string }
      >(ctx, "chat.update", {
        channel: args.channel,
        text: args.text,
        ts: args.ts,
      });
      return { channel: data.channel ?? args.channel, ts: data.ts ?? args.ts };
    },
    id: "update_message",
    inputSchema: updateMessageInput,
    providerScopes: [],
    summary: "Update a Slack message",
  },
  {
    description: "Add an emoji reaction to a Slack message.",
    group: "write",
    handler: async (input, ctx) => {
      const args = addReactionInput.parse(input);
      await slackApi<SlackApiEnvelope>(ctx, "reactions.add", {
        channel: args.channel,
        name: args.emoji,
        timestamp: args.ts,
      });
      return {
        added: true,
        channel: args.channel,
        emoji: args.emoji,
        ts: args.ts,
      };
    },
    id: "add_reaction",
    inputSchema: addReactionInput,
    providerScopes: [],
    summary: "Add a Slack reaction",
  },
  // No destructive actions in v1: chat.delete is deliberately omitted until
  // there is a concrete need for agent-driven message deletion.
];

export const slackConnector = defineConnector({
  actions,
  auth: {
    kind: "oauth2",
    oauth2: {
      authUrl: "https://slack.com/oauth/v2/authorize",
      // Empty on purpose — Slack bot scopes are unused; see SLACK_USER_SCOPES.
      baseScopes: [],
      clientIdEnv: "SLACK_OAUTH_CLIENT_ID",
      clientSecretEnv: "SLACK_OAUTH_CLIENT_SECRET",
      extraAuthParams: {
        user_scope: SLACK_USER_SCOPES.join(","),
      },
      resolveAccount: async (accessToken, fetchImpl) => {
        const response = await fetchImpl(`${SLACK_API_BASE}/auth.test`, {
          headers: { authorization: `Bearer ${accessToken}` },
          method: "POST",
        });
        if (!response.ok) {
          throw new Error(
            `slack_http_error: auth.test returned ${response.status}`
          );
        }
        const data = (await response.json()) as SlackApiEnvelope & {
          team?: string;
          user?: string;
          user_id?: string;
        };
        if (!data.ok) {
          throw new Error(`slack_api_error: ${data.error ?? "unknown_error"}`);
        }
        return {
          label: `${data.team ?? "Slack"} / ${data.user ?? "unknown"}`,
          ...(data.user_id ? { externalId: data.user_id } : {}),
        };
      },
      scopeSeparator: ",",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
    },
  },
  description:
    "Slack workspace access as the connected user: channels, history, search, messages, reactions.",
  icon: "logo:slack",
  id: "slack",
  moduleId: "connections-slack",
  name: "Slack",
  toolPrefix: "slack",
});
