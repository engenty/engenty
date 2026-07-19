// Remote channels runtime (engenty-remote Phase 1): external messengers as
// chat interfaces via Mastra AgentChannels + Chat SDK adapters.
//
// The engenty.remote agent here is persistent-by-design (one instance for the
// process lifetime — AgentChannels binds to it and Mastra initializes the
// channel pipeline when the agent is registered). Tenancy and authority do NOT
// live on the agent: every inbound platform event is wrapped in the
// engenty-tools ALS scope before Mastra's default handler runs, so the catalog
// tools (engenty_tool_execute & co) resolve tenant + credential per event.
//
// Phase 1 scope model: the AI service principal (`ENGENTY_AI_SERVICE_JWT`),
// exactly like dispatched task jobs — single-tenant, resolved once and cached.
// Phase 2 replaces this with the per-sender identity gate (pairing +
// delegated actor token); the ALS wrap below is deliberately the same seam.
//
// Credentials (spike/env mode): the Slack adapter reads SLACK_BOT_TOKEN +
// SLACK_SIGNING_SECRET from the environment — one workspace per deployment.
// The multi-tenant EngentyChannelProvider (connections-framework installation
// store) replaces this in a later phase; see the plan artifact.

import { createSlackAdapter } from "@chat-adapter/slack";
import {
  ENGENTY_REMOTE_AGENT_ID,
  remoteAgentConfig,
} from "@engenty/engenty-remote/ai/remote";
import { createLogger } from "@engenty/telemetry";
import { Agent } from "@mastra/core/agent";
import type { ChannelHandler } from "@mastra/core/channels";
import type { Mastra } from "@mastra/core/mastra";
import type { Hono } from "hono";
import { createEngentyCatalogTools } from "../../ai/tools/engenty-tools/create-engenty-tools.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import { registryAgentsListTool } from "../../ai/tools/registry-agents-list-tool.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { createCoreAiScopeResolver } from "./http.js";

const logger = createLogger({ name: "remote-channels" });

/**
 * Opt-in kill switch: the webhook surface only exists when explicitly enabled.
 * (Same pattern as ENGENTY_TEAM_CHAT_MENTIONS_ENABLED, but opt-in — this is a
 * new unauthenticated-ingress surface.)
 */
export function isRemoteChannelsEnabled(): boolean {
  return process.env.ENGENTY_REMOTE_CHANNELS_ENABLED === "true";
}

function resolveMissingEnv(): string[] {
  const required = [
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
    "ENGENTY_AI_SERVICE_JWT",
  ];
  return required.filter((key) => !process.env[key]?.trim());
}

/**
 * Resolve the AI service principal's scope once and cache it. A failed
 * resolution is not cached so a transient core outage doesn't wedge the
 * channel until restart.
 */
function createServiceScopeResolver(): () => Promise<AiSessionScope> {
  let cached: Promise<AiSessionScope> | undefined;
  const resolve = async (): Promise<AiSessionScope> => {
    const jwt = process.env.ENGENTY_AI_SERVICE_JWT?.trim();
    if (!jwt) {
      throw new Error(
        "remote-channels: ENGENTY_AI_SERVICE_JWT is required to run channel turns"
      );
    }
    const resolved = await createCoreAiScopeResolver()({
      authorization: `Bearer ${jwt}`,
    });
    if (!resolved.ok) {
      throw new Error(
        `remote-channels: failed to resolve service scope — ${resolved.error}`
      );
    }
    return resolved.scope;
  };
  return async () => {
    try {
      cached ??= resolve();
      return await cached;
    } catch (error) {
      cached = undefined;
      throw error;
    }
  };
}

/**
 * Wrap Mastra's default channel handler in the engenty-tools ALS scope. The
 * whole turn (agent.stream + every tool call) runs inside `.run()`, so the
 * catalog tools see tenant + bearer exactly like a delegated headless run
 * (see delegate-run.ts for the pattern this mirrors).
 */
function createScopeGateHandler(
  resolveScope: () => Promise<AiSessionScope>
): ChannelHandler {
  return async (thread, message, defaultHandler) => {
    const scope = await resolveScope();
    await engentyToolsRunAls.run(
      {
        ...getEngentyToolsRunContext(),
        approvalGrants: [],
        // Channel turns render approvals as platform cards eventually
        // (Phase 3); until that lands, gated operations deny with a clear
        // result instead of suspending a run nobody can resume.
        approvalPolicy: "deny",
        tenantId: scope.tenantId,
        userId: scope.userId,
        ...(scope.userAccessToken
          ? { userAccessToken: scope.userAccessToken }
          : {}),
      },
      () => defaultHandler(thread, message)
    );
  };
}

/**
 * Build the persistent channel-bound engenty.remote Agent. Config (identity,
 * instructions, model, brevity contract) comes from the engenty-remote module;
 * tools are the same dynamic-dispatch catalog set the coordinator uses.
 */
export function createRemoteChannelsAgent(): Agent {
  const gate = createScopeGateHandler(createServiceScopeResolver());
  return new Agent({
    channels: {
      adapters: {
        slack: createSlackAdapter(),
      },
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

/**
 * Register the remote channel runtime: add the agent to the Mastra instance
 * (which initializes AgentChannels) and mount its webhook routes on our Hono
 * app (we serve routes ourselves; Mastra's own server is not running).
 *
 * Webhook path shape: /api/agents/engenty.remote/channels/{platform}/webhook
 * (under the /ai base path in deployments).
 */
export async function registerRemoteChannels(
  // Matches the app.ts Hono instance; the route handlers are plain
  // (c) => Response Hono handlers from Mastra's ApiRoute contract.
  app: Hono<never>,
  input: { mastra: Mastra }
): Promise<void> {
  if (!isRemoteChannelsEnabled()) {
    return;
  }
  const missing = resolveMissingEnv();
  if (missing.length > 0) {
    logger.warn(
      `remote channels enabled but not configured — missing ${missing.join(", ")}; skipping`
    );
    return;
  }

  const agent = createRemoteChannelsAgent();
  input.mastra.addAgent(agent);

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
