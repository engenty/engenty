import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";

export const EXTERNAL_CHANNEL_PROVIDERS = ["slack", "discord"] as const;

export type ExternalChannelProvider =
  (typeof EXTERNAL_CHANNEL_PROVIDERS)[number];

export type ExternalChannelVerificationMode =
  | "not_configured"
  | "slack_signing_secret_configured"
  | "discord_public_key_configured"
  | "unsigned_dev";

export type ExternalChannelOutboundMode =
  | "disabled"
  | "slack_bot_token_configured"
  | "discord_bot_token_configured";

export interface ExternalChannelProviderConfig {
  discordBotToken?: string;
  discordPublicKey?: string;
  enabled: boolean;
  outboundMode: ExternalChannelOutboundMode;
  provider: ExternalChannelProvider;
  slackBotToken?: string;
  slackSigningSecret?: string;
  verificationMode: ExternalChannelVerificationMode;
}

export interface ExternalChannelMultimodalConfig {
  inlineLinks: boolean;
  inlineMedia: string[];
}

export interface ExternalChannelDispatchScope {
  isSuperAdmin?: boolean;
  isTenantAdmin?: boolean;
  tenantId: string;
  tenantRole?: "admin" | "member" | null;
  userAccessToken?: string;
  userId: string;
}

export interface ExternalChannelConfig {
  dispatchAgentTypeKey: string;
  dispatchEnabled: boolean;
  dispatchScope?: ExternalChannelDispatchScope;
  mastraNativeChannelsAvailable: false;
  multimodal: ExternalChannelMultimodalConfig;
  outboundEnabled: boolean;
  providers: Record<ExternalChannelProvider, ExternalChannelProviderConfig>;
  warnings: string[];
}

export type ExternalChannelIngressEvent =
  | {
      challenge: string;
      kind: "verification";
      provider: "slack";
      providerEventId: string | null;
      rawEventType: string | null;
    }
  | {
      externalChannelId: string | null;
      externalMessageId: string | null;
      externalThreadId: string | null;
      externalUserId: string | null;
      externalWorkspaceId: string | null;
      kind: "message";
      provider: ExternalChannelProvider;
      providerEventId: string | null;
      rawEventType: string | null;
      text: string;
    };

export type ExternalChannelVerificationResult =
  | { ok: true }
  | {
      error:
        | "channels.invalidWebhookSignature"
        | "channels.missingWebhookSignature"
        | "channels.webhookSignatureExpired"
        | "channels.webhookVerificationNotConfigured";
      ok: false;
      status: 401 | 503;
    };

export interface ExternalChannelVerificationInput {
  headers: Headers;
  nowMs?: number;
  rawBody: string;
  rawBodyBytes: Uint8Array;
}

const providerSet = new Set<string>(EXTERNAL_CHANNEL_PROVIDERS);
export const DEFAULT_EXTERNAL_CHANNEL_AGENT_TYPE_KEY = "engenty.copilot";

export function isExternalChannelProvider(
  value: string
): value is ExternalChannelProvider {
  return providerSet.has(value);
}

export function createExternalChannelConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): ExternalChannelConfig {
  const channelsEnabled = parseBooleanEnv(env.ENGENTY_AI_CHANNELS_ENABLED);
  const requestedProviders = parseProviderList(
    env.ENGENTY_AI_CHANNEL_PROVIDERS
  );
  const warnings = requestedProviders.unsupported.map(
    (provider) => `Unsupported external channel provider: ${provider}`
  );
  const dispatchScope = readDispatchScope(env, warnings);
  const unsignedDevEnabled =
    parseBooleanEnv(env.ENGENTY_AI_CHANNELS_ALLOW_UNSIGNED_WEBHOOKS) &&
    env.NODE_ENV !== "production";
  const enabledProviders = new Set(
    channelsEnabled ? requestedProviders.supported : []
  );
  const outboundEnabled = parseBooleanEnv(
    env.ENGENTY_AI_CHANNELS_OUTBOUND_ENABLED
  );

  return {
    dispatchAgentTypeKey:
      env.ENGENTY_AI_CHANNEL_AGENT_TYPE_KEY?.trim() ||
      DEFAULT_EXTERNAL_CHANNEL_AGENT_TYPE_KEY,
    dispatchEnabled: parseBooleanEnv(env.ENGENTY_AI_CHANNELS_DISPATCH_ENABLED),
    ...(dispatchScope ? { dispatchScope } : {}),
    mastraNativeChannelsAvailable: false,
    multimodal: {
      inlineLinks: parseBooleanEnv(env.ENGENTY_AI_CHANNELS_INLINE_LINKS),
      inlineMedia: parseInlineMedia(env.ENGENTY_AI_CHANNELS_INLINE_MEDIA),
    },
    outboundEnabled,
    providers: {
      slack: {
        enabled: enabledProviders.has("slack"),
        outboundMode: resolveSlackOutboundMode(env, outboundEnabled),
        provider: "slack",
        slackBotToken: readSecret(env.ENGENTY_AI_SLACK_BOT_TOKEN),
        slackSigningSecret: readSecret(env.ENGENTY_AI_SLACK_SIGNING_SECRET),
        verificationMode: resolveSlackVerificationMode(env, unsignedDevEnabled),
      },
      discord: {
        discordBotToken: readSecret(env.ENGENTY_AI_DISCORD_BOT_TOKEN),
        discordPublicKey: readSecret(env.ENGENTY_AI_DISCORD_PUBLIC_KEY),
        enabled: enabledProviders.has("discord"),
        outboundMode: resolveDiscordOutboundMode(env, outboundEnabled),
        provider: "discord",
        verificationMode: resolveDiscordVerificationMode(
          env,
          unsignedDevEnabled
        ),
      },
    },
    warnings,
  };
}

export function verifyExternalChannelRequest(
  provider: ExternalChannelProvider,
  config: ExternalChannelProviderConfig,
  input: ExternalChannelVerificationInput
): ExternalChannelVerificationResult {
  switch (config.verificationMode) {
    case "unsigned_dev":
      return { ok: true };
    case "not_configured":
      return {
        error: "channels.webhookVerificationNotConfigured",
        ok: false,
        status: 503,
      };
    case "slack_signing_secret_configured":
      if (provider !== "slack" || !config.slackSigningSecret) {
        return {
          error: "channels.webhookVerificationNotConfigured",
          ok: false,
          status: 503,
        };
      }
      return verifySlackRequest(config.slackSigningSecret, input);
    case "discord_public_key_configured":
      if (provider !== "discord" || !config.discordPublicKey) {
        return {
          error: "channels.webhookVerificationNotConfigured",
          ok: false,
          status: 503,
        };
      }
      return verifyDiscordRequest(config.discordPublicKey, input);
    default:
      return assertNever(config.verificationMode);
  }
}

export function normalizeExternalChannelIngress(
  provider: ExternalChannelProvider,
  payload: unknown
): ExternalChannelIngressEvent | null {
  if (!isRecord(payload)) {
    return null;
  }
  switch (provider) {
    case "slack":
      return normalizeSlackIngress(payload);
    case "discord":
      return normalizeDiscordIngress(payload);
    default:
      return assertNever(provider);
  }
}

function normalizeSlackIngress(
  payload: Record<string, unknown>
): ExternalChannelIngressEvent | null {
  const rawEventType = readString(payload.type);
  if (rawEventType === "url_verification") {
    const challenge = readString(payload.challenge);
    if (!challenge) {
      return null;
    }
    return {
      challenge,
      kind: "verification",
      provider: "slack",
      providerEventId: readString(payload.event_id),
      rawEventType,
    };
  }

  const event = payload.event;
  if (!isRecord(event)) {
    return null;
  }
  const text = readString(event.text);
  if (!text) {
    return null;
  }
  return {
    externalChannelId: readString(event.channel),
    externalMessageId: readString(event.ts) ?? readString(payload.event_id),
    externalThreadId: readString(event.thread_ts) ?? readString(event.ts),
    externalUserId: readString(event.user),
    externalWorkspaceId: readString(payload.team_id),
    kind: "message",
    provider: "slack",
    providerEventId: readString(payload.event_id),
    rawEventType: readString(event.type) ?? rawEventType,
    text,
  };
}

function normalizeDiscordIngress(
  payload: Record<string, unknown>
): ExternalChannelIngressEvent | null {
  const content = readString(payload.content);
  if (!content) {
    return null;
  }
  const author = payload.author;
  return {
    externalChannelId: readString(payload.channel_id),
    externalMessageId: readString(payload.id),
    externalThreadId:
      readString(payload.thread_id) ?? readString(payload.channel_id),
    externalUserId: isRecord(author) ? readString(author.id) : null,
    externalWorkspaceId: readString(payload.guild_id),
    kind: "message",
    provider: "discord",
    providerEventId: readString(payload.id),
    rawEventType: readString(payload.type),
    text: content,
  };
}

function parseProviderList(value: string | undefined): {
  supported: ExternalChannelProvider[];
  unsupported: string[];
} {
  const supported: ExternalChannelProvider[] = [];
  const unsupported: string[] = [];
  for (const item of (value ?? "").split(",")) {
    const provider = item.trim().toLowerCase();
    if (!provider) {
      continue;
    }
    if (isExternalChannelProvider(provider)) {
      supported.push(provider);
    } else {
      unsupported.push(provider);
    }
  }
  return { supported: [...new Set(supported)], unsupported };
}

function parseInlineMedia(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function resolveSlackVerificationMode(
  env: Record<string, string | undefined>,
  unsignedDevEnabled: boolean
): ExternalChannelVerificationMode {
  return env.ENGENTY_AI_SLACK_SIGNING_SECRET?.trim()
    ? "slack_signing_secret_configured"
    : unsignedDevEnabled
      ? "unsigned_dev"
      : "not_configured";
}

function resolveDiscordVerificationMode(
  env: Record<string, string | undefined>,
  unsignedDevEnabled: boolean
): ExternalChannelVerificationMode {
  return env.ENGENTY_AI_DISCORD_PUBLIC_KEY?.trim()
    ? "discord_public_key_configured"
    : unsignedDevEnabled
      ? "unsigned_dev"
      : "not_configured";
}

function resolveSlackOutboundMode(
  env: Record<string, string | undefined>,
  outboundEnabled: boolean
): ExternalChannelOutboundMode {
  return outboundEnabled && env.ENGENTY_AI_SLACK_BOT_TOKEN?.trim()
    ? "slack_bot_token_configured"
    : "disabled";
}

function resolveDiscordOutboundMode(
  env: Record<string, string | undefined>,
  outboundEnabled: boolean
): ExternalChannelOutboundMode {
  return outboundEnabled && env.ENGENTY_AI_DISCORD_BOT_TOKEN?.trim()
    ? "discord_bot_token_configured"
    : "disabled";
}

function verifySlackRequest(
  signingSecret: string,
  input: ExternalChannelVerificationInput
): ExternalChannelVerificationResult {
  const timestamp = input.headers.get("x-slack-request-timestamp");
  const signature = input.headers.get("x-slack-signature");
  if (!(timestamp && signature)) {
    return {
      error: "channels.missingWebhookSignature",
      ok: false,
      status: 401,
    };
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)) {
    return {
      error: "channels.invalidWebhookSignature",
      ok: false,
      status: 401,
    };
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > 300) {
    return {
      error: "channels.webhookSignatureExpired",
      ok: false,
      status: 401,
    };
  }

  const baseString = `v0:${timestamp}:${input.rawBody}`;
  const expectedSignature = `v0=${createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex")}`;
  return timingSafeStringEqual(signature, expectedSignature)
    ? { ok: true }
    : {
        error: "channels.invalidWebhookSignature",
        ok: false,
        status: 401,
      };
}

function verifyDiscordRequest(
  publicKeyHex: string,
  input: ExternalChannelVerificationInput
): ExternalChannelVerificationResult {
  const signature = input.headers.get("x-signature-ed25519");
  const timestamp = input.headers.get("x-signature-timestamp");
  if (!(signature && timestamp)) {
    return {
      error: "channels.missingWebhookSignature",
      ok: false,
      status: 401,
    };
  }

  const publicKeyBytes = decodeHex(publicKeyHex, 32);
  const signatureBytes = decodeHex(signature, 64);
  if (!(publicKeyBytes && signatureBytes)) {
    return {
      error: "channels.invalidWebhookSignature",
      ok: false,
      status: 401,
    };
  }

  try {
    const key = createPublicKey({
      format: "der",
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        publicKeyBytes,
      ]),
      type: "spki",
    });
    const message = Buffer.concat([
      Buffer.from(timestamp, "utf8"),
      Buffer.from(input.rawBodyBytes),
    ]);
    return verifySignature(null, message, key, signatureBytes)
      ? { ok: true }
      : {
          error: "channels.invalidWebhookSignature",
          ok: false,
          status: 401,
        };
  } catch {
    return {
      error: "channels.invalidWebhookSignature",
      ok: false,
      status: 401,
    };
  }
}

function parseBooleanEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readSecret(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readDispatchScope(
  env: Record<string, string | undefined>,
  warnings: string[]
): ExternalChannelDispatchScope | undefined {
  const tenantId = env.ENGENTY_AI_CHANNEL_TENANT_ID?.trim();
  const userId = env.ENGENTY_AI_CHANNEL_USER_ID?.trim();
  if (!(tenantId || userId)) {
    return;
  }
  if (!(isUuid(tenantId) && isUuid(userId))) {
    warnings.push(
      "External channel dispatch scope requires ENGENTY_AI_CHANNEL_TENANT_ID and ENGENTY_AI_CHANNEL_USER_ID UUIDs"
    );
    return;
  }
  const accessToken = env.ENGENTY_AI_CHANNEL_USER_ACCESS_TOKEN?.trim();
  return {
    tenantId,
    userId,
    ...(accessToken ? { userAccessToken: accessToken } : {}),
  };
}

function isUuid(value: string | undefined): value is string {
  return !!value && uuidPattern.test(value);
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeHex(value: string, expectedBytes: number): Buffer | null {
  if (value.length !== expectedBytes * 2 || !/^[\da-f]+$/i.test(value)) {
    return null;
  }
  return Buffer.from(value, "hex");
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled external channel provider: ${value}`);
}
