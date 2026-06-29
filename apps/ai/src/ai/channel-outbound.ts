import type {
  ExternalChannelConfig,
  ExternalChannelIngressEvent,
  ExternalChannelProvider,
  ExternalChannelProviderConfig,
} from "./channels.js";

export type ExternalChannelOutboundResult =
  | {
      reason:
        | "outbound_channel_replies_disabled"
        | "provider_outbound_not_configured";
      status: "not_sent";
    }
  | {
      http_status: number;
      provider: ExternalChannelProvider;
      provider_message_id: string | null;
      status: "sent";
    }
  | {
      http_status?: number;
      provider: ExternalChannelProvider;
      reason:
        | "provider_fetch_failed"
        | "provider_http_error"
        | "provider_response_error";
      status: "failed";
    };

export interface ExternalChannelOutboundSender {
  sendReply(
    input: ExternalChannelOutboundInput
  ): Promise<ExternalChannelOutboundResult>;
}

export interface ExternalChannelOutboundInput {
  config: ExternalChannelConfig;
  event: Extract<ExternalChannelIngressEvent, { kind: "message" }>;
  replyText: string;
}

export type ExternalChannelFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export function createNoopExternalChannelOutboundSender(): ExternalChannelOutboundSender {
  return {
    async sendReply() {
      return {
        reason: "outbound_channel_replies_disabled",
        status: "not_sent",
      };
    },
  };
}

export function createHttpExternalChannelOutboundSender(options: {
  fetch: ExternalChannelFetch;
}): ExternalChannelOutboundSender {
  return {
    sendReply: (input) => sendExternalChannelReply(input, options.fetch),
  };
}

export async function sendExternalChannelReply(
  input: ExternalChannelOutboundInput,
  fetchImpl: ExternalChannelFetch
): Promise<ExternalChannelOutboundResult> {
  if (!input.config.outboundEnabled) {
    return {
      reason: "outbound_channel_replies_disabled",
      status: "not_sent",
    };
  }

  const providerConfig = input.config.providers[input.event.provider];
  if (providerConfig.outboundMode === "disabled") {
    return {
      reason: "provider_outbound_not_configured",
      status: "not_sent",
    };
  }

  switch (input.event.provider) {
    case "slack":
      return sendSlackReply(input, providerConfig, fetchImpl);
    case "discord":
      return sendDiscordReply(input, providerConfig, fetchImpl);
    default:
      return assertNever(input.event.provider);
  }
}

async function sendSlackReply(
  input: ExternalChannelOutboundInput,
  providerConfig: ExternalChannelProviderConfig,
  fetchImpl: ExternalChannelFetch
): Promise<ExternalChannelOutboundResult> {
  if (!(providerConfig.slackBotToken && input.event.externalChannelId)) {
    return {
      reason: "provider_outbound_not_configured",
      status: "not_sent",
    };
  }

  const body = {
    channel: input.event.externalChannelId,
    text: input.replyText,
    ...(input.event.externalThreadId
      ? { thread_ts: input.event.externalThreadId }
      : {}),
  };
  return sendJsonRequest({
    body,
    fetchImpl,
    headers: {
      Authorization: `Bearer ${providerConfig.slackBotToken}`,
    },
    isProviderSuccess: (payload) => isRecord(payload) && payload.ok === true,
    parseProviderMessageId: (payload) =>
      isRecord(payload) ? readString(payload.ts) : null,
    provider: "slack",
    url: "https://slack.com/api/chat.postMessage",
  });
}

async function sendDiscordReply(
  input: ExternalChannelOutboundInput,
  providerConfig: ExternalChannelProviderConfig,
  fetchImpl: ExternalChannelFetch
): Promise<ExternalChannelOutboundResult> {
  if (!(providerConfig.discordBotToken && input.event.externalChannelId)) {
    return {
      reason: "provider_outbound_not_configured",
      status: "not_sent",
    };
  }

  const body = {
    content: input.replyText,
    ...(input.event.externalMessageId
      ? {
          message_reference: {
            channel_id: input.event.externalChannelId,
            ...(input.event.externalWorkspaceId
              ? { guild_id: input.event.externalWorkspaceId }
              : {}),
            message_id: input.event.externalMessageId,
          },
        }
      : {}),
  };
  return sendJsonRequest({
    body,
    fetchImpl,
    headers: {
      Authorization: `Bot ${providerConfig.discordBotToken}`,
    },
    parseProviderMessageId: (payload) =>
      isRecord(payload) ? readString(payload.id) : null,
    provider: "discord",
    url: `https://discord.com/api/v10/channels/${encodeURIComponent(
      input.event.externalChannelId
    )}/messages`,
  });
}

async function sendJsonRequest(input: {
  body: Record<string, unknown>;
  fetchImpl: ExternalChannelFetch;
  headers: Record<string, string>;
  isProviderSuccess?: (payload: unknown) => boolean;
  parseProviderMessageId: (payload: unknown) => string | null;
  provider: ExternalChannelProvider;
  url: string;
}): Promise<ExternalChannelOutboundResult> {
  let response: Response;
  try {
    response = await input.fetchImpl(input.url, {
      body: JSON.stringify(input.body),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...input.headers,
      },
      method: "POST",
    });
  } catch {
    return {
      provider: input.provider,
      reason: "provider_fetch_failed",
      status: "failed",
    };
  }

  if (!response.ok) {
    return {
      http_status: response.status,
      provider: input.provider,
      reason: "provider_http_error",
      status: "failed",
    };
  }

  const payload = await readJson(response);
  if (input.isProviderSuccess && !input.isProviderSuccess(payload)) {
    return {
      http_status: response.status,
      provider: input.provider,
      reason: "provider_response_error",
      status: "failed",
    };
  }
  return {
    http_status: response.status,
    provider: input.provider,
    provider_message_id: input.parseProviderMessageId(payload),
    status: "sent",
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled external channel provider: ${value}`);
}
