// Remote channels runtime (engenty-remote): external messengers as chat
// interfaces via Mastra AgentChannels + Chat SDK adapters.
//
// The engenty.remote agent is persistent-by-design (one instance for the
// process lifetime — AgentChannels binds to it and Mastra initializes the
// channel pipeline when the agent is registered). Tenancy and authority do NOT
// live on the agent: every inbound platform event passes the identity gate
// below, which resolves binding → tenant and sender → engenty user, then wraps
// Mastra's default handler in the engenty-tools ALS scope with a SHORT-LIVED
// DELEGATED ACTOR TOKEN for that user (minted by core, audited). Unmapped
// senders get a pairing invite / silence / denial per the binding's policy.
//
// Platforms are env-gated per adapter (Slack: SLACK_BOT_TOKEN +
// SLACK_SIGNING_SECRET; Telegram: TELEGRAM_BOT_TOKEN) behind the master
// ENGENTY_REMOTE_CHANNELS_ENABLED switch. Proactive sends ride the
// `remote_outbound` pgmq queue (fed by the remote_notify gateway op) and are
// delivered through the same Chat SDK instance.

import { createSlackAdapter } from "@chat-adapter/slack";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import {
  ENGENTY_REMOTE_AGENT_ID,
  remoteAgentConfig,
} from "@engenty/engenty-remote/ai/remote";
import { type QueueService, startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { Agent } from "@mastra/core/agent";
import type { ChannelHandler } from "@mastra/core/channels";
import type { Mastra } from "@mastra/core/mastra";
import type { Hono } from "hono";
import { z } from "zod";
import { createEngentyCatalogTools } from "../../ai/tools/engenty-tools/create-engenty-tools.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import { registryAgentsListTool } from "../../ai/tools/registry-agents-list-tool.js";
import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import { createSchedulerOperationInvoker } from "../scheduler/service-invoker.js";

const logger = createLogger({ name: "remote-channels" });

export const REMOTE_OUTBOUND_QUEUE = "remote_outbound";

/**
 * Opt-in kill switch: the webhook surface only exists when explicitly enabled.
 */
export function isRemoteChannelsEnabled(): boolean {
  return process.env.ENGENTY_REMOTE_CHANNELS_ENABLED === "true";
}

function slackConfigured(): boolean {
  return Boolean(
    process.env.SLACK_BOT_TOKEN?.trim() &&
      process.env.SLACK_SIGNING_SECRET?.trim()
  );
}

function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

// ── Sender resolution (module gateway op, service principal) ────────────────

const resolveSenderResult = z.object({
  binding: z
    .object({
      agent_id: z.string(),
      id: z.string(),
      platform: z.string(),
      status: z.string(),
      unmapped_sender_policy: z.enum(["ignore", "invite", "deny"]),
    })
    .passthrough()
    .nullable(),
  identity: z.object({ user_id: z.string() }).passthrough().nullable(),
  ok: z.literal(true),
  pairing_code: z.string().nullable(),
});

type ResolveSenderResult = z.infer<typeof resolveSenderResult>;

async function resolveSender(input: {
  displayName?: string;
  externalUserId: string;
  platform: string;
}): Promise<ResolveSenderResult> {
  const invoke = createSchedulerOperationInvoker();
  const raw = await invoke("remote_runtime_resolve_sender", {
    display_name: input.displayName,
    external_user_id: input.externalUserId,
    platform: input.platform,
  });
  return resolveSenderResult.parse(raw);
}

// ── Delegated actor tokens (short-lived, cached until near expiry) ──────────

interface CachedActorToken {
  expiresAtMs: number;
  token: string;
}

const actorTokenCache = new Map<string, CachedActorToken>();
const ACTOR_TOKEN_TTL_SECONDS = 300;
const ACTOR_TOKEN_REFRESH_MARGIN_MS = 60_000;

async function mintActorToken(input: {
  tenantId: string;
  userId: string;
}): Promise<string> {
  const key = `${input.tenantId}:${input.userId}`;
  const cached = actorTokenCache.get(key);
  if (
    cached &&
    cached.expiresAtMs - Date.now() > ACTOR_TOKEN_REFRESH_MARGIN_MS
  ) {
    return cached.token;
  }
  const serviceJwt = process.env.ENGENTY_AI_SERVICE_JWT?.trim();
  if (!serviceJwt) {
    throw new Error("remote-channels: ENGENTY_AI_SERVICE_JWT is required");
  }
  const response = await fetch(
    `${getEngentyCoreBaseUrlFromEnv()}/api/auth/actor-token`,
    {
      body: JSON.stringify({
        reason: "remote-channel turn",
        tenant_id: input.tenantId,
        ttl_seconds: ACTOR_TOKEN_TTL_SECONDS,
        user_id: input.userId,
      }),
      headers: {
        authorization: `Bearer ${serviceJwt}`,
        "content-type": "application/json",
      },
      method: "POST",
    }
  );
  if (!response.ok) {
    throw new Error(
      `remote-channels: actor token mint failed (${response.status})`
    );
  }
  const body = (await response.json()) as { expires_in: number; token: string };
  actorTokenCache.set(key, {
    expiresAtMs: Date.now() + body.expires_in * 1000,
    token: body.token,
  });
  return body.token;
}

// ── Identity gate (wraps Mastra's default channel handler) ──────────────────

function pairingUrl(code: string): string {
  const base = (
    process.env.PUBLIC_APP_URL ??
    process.env.ENGENTY_APP_BASE_URL ??
    ""
  ).replace(/\/$/, "");
  const path = `/mdl/engenty-remote/pair?code=${encodeURIComponent(code)}`;
  return base ? `${base}${path}` : path;
}

/** Exported for tests. */
export function createIdentityGateHandler(): ChannelHandler {
  return async (thread, message, defaultHandler) => {
    // Never react to our own or other bots' messages beyond Mastra's own
    // guards — cheap belt-and-suspenders for the gate's side effects.
    if (message.author.isMe) {
      return;
    }
    const platform =
      (thread as { adapterName?: string }).adapterName ?? "slack";
    let resolved: ResolveSenderResult;
    try {
      resolved = await resolveSender({
        displayName: message.author.fullName,
        externalUserId: message.author.userId,
        platform,
      });
    } catch (error) {
      logger.error("remote channels: sender resolution failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    if (resolved.binding?.status !== "active") {
      logger.warn("remote channels: no active binding for inbound event", {
        platform,
      });
      return;
    }

    if (!resolved.identity) {
      const policy = resolved.binding.unmapped_sender_policy;
      if (policy === "ignore") {
        return;
      }
      if (policy === "deny") {
        await thread.post(
          "This assistant is only available to linked engenty users."
        );
        return;
      }
      if (resolved.pairing_code) {
        await thread.post(
          `Hi! To use engenty from here, link this chat account to your engenty user: ${pairingUrl(resolved.pairing_code)} (the link expires in 15 minutes).`
        );
      }
      return;
    }

    // Mapped sender: the whole turn (agent.stream + every tool call) runs
    // inside the ALS scope with the user's delegated token — catalog tools
    // execute with the user's own capabilities (see delegate-run.ts for the
    // pattern this mirrors).
    const tenantId = (resolved.binding as { tenant_id?: string }).tenant_id;
    const userId = resolved.identity.user_id;
    let actorToken: string;
    try {
      actorToken = await mintActorToken({
        tenantId: tenantId ?? "",
        userId,
      });
    } catch (error) {
      logger.error("remote channels: actor token mint failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      await thread.post(
        "Something went wrong on my side — please try again in a moment."
      );
      return;
    }

    await engentyToolsRunAls.run(
      {
        ...getEngentyToolsRunContext(),
        approvalGrants: [],
        // Native HITL: a gated operation suspends the run and Mastra channels
        // renders the Approve/Deny card in the platform thread, resuming on
        // click (Phase 3).
        approvalPolicy: "suspend",
        tenantId: tenantId ?? null,
        userId,
        userAccessToken: actorToken,
      },
      () => defaultHandler(thread, message)
    );
  };
}

// ── Agent + adapters ────────────────────────────────────────────────────────

/**
 * Build the persistent channel-bound engenty.remote Agent. Config (identity,
 * instructions, model, brevity contract) comes from the engenty-remote module;
 * tools are the same dynamic-dispatch catalog set the coordinator uses.
 * Adapters are added per configured platform.
 */
export function createRemoteChannelsAgent(): Agent {
  const gate = createIdentityGateHandler();
  const adapters: Record<string, unknown> = {};
  if (slackConfigured()) {
    adapters.slack = createSlackAdapter();
  }
  if (telegramConfigured()) {
    adapters.telegram = createTelegramAdapter();
  }
  return new Agent({
    channels: {
      adapters: adapters as never,
      handlers: {
        onDirectMessage: gate,
        onMention: gate,
        onSubscribedMessage: gate,
      },
    },
    id: ENGENTY_REMOTE_AGENT_ID,
    instructions: remoteAgentConfig.instructions,
    model: remoteAgentConfig.model,
    name: "Remote",
    tools: {
      ...createEngentyCatalogTools(),
      registry_agents_list: registryAgentsListTool,
    },
  });
}

let activeAgent: Agent | null = null;

/** The channel-bound agent, when the runtime is enabled and registered. */
export function getRemoteChannelsAgent(): Agent | null {
  return activeAgent;
}

/**
 * Register the remote channel runtime: add the agent to the Mastra instance
 * (which initializes AgentChannels) and mount its webhook routes on our Hono
 * app (we serve routes ourselves; Mastra's own server is not running).
 *
 * Webhook path shape: /api/agents/engenty.remote/channels/{platform}/webhook
 * (under the /ai base path in deployments).
 */
export async function registerRemoteChannels(
  app: Hono<never>,
  input: { mastra: Mastra }
): Promise<void> {
  if (!isRemoteChannelsEnabled()) {
    return;
  }
  if (!process.env.ENGENTY_AI_SERVICE_JWT?.trim()) {
    logger.warn(
      "remote channels enabled but ENGENTY_AI_SERVICE_JWT is missing; skipping"
    );
    return;
  }
  if (!(slackConfigured() || telegramConfigured())) {
    logger.warn(
      "remote channels enabled but no platform is configured (SLACK_BOT_TOKEN+SLACK_SIGNING_SECRET or TELEGRAM_BOT_TOKEN); skipping"
    );
    return;
  }

  const agent = createRemoteChannelsAgent();
  input.mastra.addAgent(agent);
  activeAgent = agent;

  const channels = agent.getChannels();
  if (!channels) {
    logger.warn("remote channels: agent has no AgentChannels; skipping");
    return;
  }
  let mounted = 0;
  for (const route of channels.getWebhookRoutes()) {
    // Mastra ApiRoutes come in two shapes: a plain Hono handler, or a
    // createHandler factory awaiting the Mastra instance.
    const handler =
      "handler" in route && typeof route.handler === "function"
        ? route.handler
        : "createHandler" in route && typeof route.createHandler === "function"
          ? await route.createHandler({ mastra: input.mastra })
          : undefined;
    if (!handler) {
      continue;
    }
    if (route.method === "ALL") {
      app.all(route.path, handler);
    } else {
      app.on(route.method, route.path, handler);
    }
    mounted += 1;
    logger.info(`remote channels: mounted ${route.method} ${route.path}`);
  }
  if (mounted === 0) {
    logger.warn("remote channels: no webhook routes to mount");
  }
}

// ── Proactive outbound consumer (remote_outbound queue) ─────────────────────

const outboundPayloadSchema = z.object({
  external_thread_id: z.string().min(1),
  platform: z.string().min(1),
  tenant_id: z.string().min(1),
  text: z.string().min(1),
});

/**
 * Deliver queued proactive messages (from the remote_notify gateway op) into
 * platform threads via the live Chat SDK instance. No-op consumer when the
 * runtime is disabled — messages stay queued until a configured process picks
 * them up.
 */
export function startRemoteOutboundConsumer(input: {
  queue: QueueService;
}): () => void {
  if (!isRemoteChannelsEnabled()) {
    return () => {};
  }
  const handlers = new Map([
    [
      REMOTE_OUTBOUND_QUEUE,
      async (payload: unknown) => {
        const parsed = outboundPayloadSchema.parse(payload);
        const sdk = activeAgent?.getChannels()?.sdk;
        if (!sdk) {
          throw new Error("remote channels sdk not ready");
        }
        await sdk.thread(parsed.external_thread_id).post(parsed.text);
        logger.info("remote channels: delivered proactive message", {
          platform: parsed.platform,
        });
      },
    ],
  ]);
  return startQueueWorker({ handlers, queue: input.queue });
}
