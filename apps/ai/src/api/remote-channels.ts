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
// SLACK_SIGNING_SECRET; Telegram: TELEGRAM_BOT_TOKEN) — configuring one is
// what turns the runtime on, with ENGENTY_REMOTE_CHANNELS_ENABLED=false as the
// operator's kill switch over the top. Proactive sends ride the
// `remote_outbound` pgmq queue (fed by the remote_notify gateway op) and are
// delivered through the same Chat SDK instance.

import { randomUUID } from "node:crypto";
import type { AgentConfig } from "@engenty/ai-core";
import { type QueueService, startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { Agent } from "@mastra/core/agent";
import type { ChannelHandler } from "@mastra/core/channels";
import type { Mastra } from "@mastra/core/mastra";
import type { HonoBindings, HonoVariables } from "@mastra/hono";
import type { Hono } from "hono";
import { z } from "zod";
import { createEngentyCatalogTools } from "../../ai/tools/engenty-tools/create-engenty-tools.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../ai/tools/engenty-tools/lib/run-context.js";
import { registryAgentsListTool } from "../../ai/tools/registry-agents-list-tool.js";
import { resolveCoreAgentId } from "../ai/agent-identity.js";
import { getEngentyCoreBaseUrlFromEnv } from "../ai/core-http-client.js";
import {
  createEngentySessionMastraMemory,
  createEngentySessionMemoryStorage,
} from "../ai/memory/index.js";
import { resolveAgentModel } from "../ai/registry/assemble-dynamic-agent.js";
import type { AiRegistry } from "../ai/registry/index.js";
import {
  getServiceAccessToken,
  isServiceCredentialConfigured,
} from "../ai/service-credential.js";
import { AI_BASE_PATH } from "../config/constants.js";
import type { ThreadStore } from "../dal/threads/index.js";
import { createSchedulerOperationInvoker } from "../scheduler/service-invoker.js";
import { listTenantIds } from "../scheduler/tenants.js";
import {
  ENGENTY_REMOTE_AGENT_ID,
  loadRemoteAgentConfig,
} from "./load-engenty-remote.js";
import { configuredRemoteChannelProviders } from "./remote-channels/providers/index.js";
import {
  type RemoteTargetResolution,
  resolveRemoteTarget,
  unreachableAgentReply,
} from "./remote-channels/remote-agent-routing.js";
import {
  remoteAgentThreadId,
  runRemoteAgentTurn,
} from "./remote-channels/remote-agent-turn.js";

const logger = createLogger({ name: "remote-channels" });

export const REMOTE_OUTBOUND_QUEUE = "remote_outbound";

/**
 * Kill switch, opt-OUT. Configuring a platform is the enablement signal — an
 * operator who set SLACK_BOT_TOKEN under the "Remote channels" group meant it,
 * and those variable names are used by no other feature, so presence is
 * unambiguous. This switch exists to shut ingress off during an incident
 * without rotating or deleting a bot token, which is slow and disruptive.
 */
export function isRemoteChannelsEnabled(): boolean {
  return process.env.ENGENTY_REMOTE_CHANNELS_ENABLED?.trim() !== "false";
}

function anyPlatformConfigured(): boolean {
  return configuredRemoteChannelProviders().length > 0;
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
  // Conversation routing row (R1): tenancy + pointer to the backing engenty
  // thread. Null when the op received no external_thread_id.
  conversation: z
    .object({ ai_thread_id: z.string().nullable(), id: z.string() })
    .nullable(),
  // False when the platform event id was already recorded — a webhook replay
  // (platform retry, or a restart inside the retry window). Durable, unlike
  // Chat SDK's in-memory dedup.
  fresh: z.boolean(),
  identity: z.object({ user_id: z.string() }).passthrough().nullable(),
  ok: z.literal(true),
  pairing_code: z.string().nullable(),
});

type ResolveSenderResult = z.infer<typeof resolveSenderResult>;

type OperationInvoker = (
  operationId: string,
  input: Record<string, unknown>
) => Promise<unknown>;

/**
 * Workspace anchor from the platform's raw payload (`message.raw` is the Chat
 * SDK escape hatch). Binding resolution is workspace-first: without this value
 * a workspace-anchored binding can never match and multi-workspace routing is
 * impossible — the platform-only fallback covers exactly ONE anchor-less
 * binding and refuses when several tenants are bound (never guess a tenant).
 *
 * Slack events carry the id in several shapes: `team_id` / `team` as a string
 * on message events, `team.id` (object, `user.team_id` fallback) on
 * block_actions payloads. Telegram has no workspace concept — the bot token IS
 * the anchor, one bot per deployment until R4 makes credentials per-tenant.
 * Exported for tests.
 */
export function extractExternalWorkspaceId(
  platform: string,
  raw: unknown
): string | null {
  if (platform !== "slack") {
    return null;
  }
  const r = raw as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== "object") {
    return null;
  }
  const candidates = [
    r.team_id,
    typeof r.team === "string" ? r.team : undefined,
    (r.team as Record<string, unknown> | undefined)?.id,
    (r.user as Record<string, unknown> | undefined)?.team_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

async function resolveSender(
  invoke: OperationInvoker,
  input: {
    displayName?: string;
    externalEventId?: string;
    externalThreadId?: string;
    externalUserId: string;
    externalWorkspaceId?: string | null;
    isDm?: boolean;
    platform: string;
  }
): Promise<ResolveSenderResult> {
  const raw = await invoke("remote_runtime_resolve_sender", {
    display_name: input.displayName,
    external_event_id: input.externalEventId,
    external_thread_id: input.externalThreadId,
    external_user_id: input.externalUserId,
    external_workspace_id: input.externalWorkspaceId ?? null,
    is_dm: input.isDm,
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
  // Minted for the binding's tenant: the actor-token route refuses
  // cross-tenant minting, so the service token presented must itself be
  // scoped to the tenant whose user is being impersonated.
  const serviceJwt = await getServiceAccessToken(
    input.tenantId ? { tenantId: input.tenantId } : undefined
  );
  if (!serviceJwt) {
    throw new Error(
      "remote-channels: a service credential (ENGENTY_AI_SERVICE_SECRET) is required"
    );
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

// ── Channel threads (R2) ────────────────────────────────────────────────────
//
// One platform thread ⇒ one dedicated engenty thread on engenty.remote, never
// mixed with copilot threads unless the user /link's one explicitly. The trick:
// AgentChannels#getOrCreateThread looks the mapping thread up BY METADATA in
// the global Mastra memory store and, on hit, passes ITS id to agent.stream as
// the memory thread id. So we pre-create that mapping thread with our own UUID
// and the exact metadata the SDK filters on — the SDK adopts our thread, and
// with the tenant-scoped memory resolver below the messages land in ai.thread /
// ai.thread_message like every other conversation in the product.

export interface RemoteChannelDeps {
  /**
   * Tenant-scoped registry for per-Engenty turns (P5): a bound or `@handle`
   * addressed agent is assembled from it as itself. Absent = every turn goes
   * to the front door, whatever the binding says.
   */
  getRegistry?: (tenantId: string) => AiRegistry;
  mastra: Mastra;
  threadStore: ThreadStore;
}

const CHANNEL_MAPPING_KEYS = {
  channelId: "channel_externalChannelId",
  platform: "channel_platform",
  threadId: "channel_externalThreadId",
} as const;

async function getGlobalMemoryStore(mastra: Mastra) {
  const storage = mastra.getStorage();
  const memoryStore = storage ? await storage.getStore("memory") : undefined;
  if (!memoryStore) {
    throw new Error(
      "remote channels: Mastra storage with a memory store is required for channel thread mapping"
    );
  }
  return memoryStore;
}

/**
 * Create the SDK mapping thread for a platform thread, pointing at
 * `aiThreadId`. `saveThread` is an upsert, so re-pointing (/new, /link) is the
 * same write after `detachMappingThreads`.
 */
async function saveMappingThread(input: {
  aiThreadId: string;
  channelId?: string;
  externalThreadId: string;
  mastra: Mastra;
  platform: string;
  userId: string;
}): Promise<void> {
  const memoryStore = await getGlobalMemoryStore(input.mastra);
  await memoryStore.saveThread({
    thread: {
      createdAt: new Date(),
      id: input.aiThreadId,
      metadata: {
        [CHANNEL_MAPPING_KEYS.channelId]: input.channelId,
        [CHANNEL_MAPPING_KEYS.platform]: input.platform,
        [CHANNEL_MAPPING_KEYS.threadId]: input.externalThreadId,
      },
      resourceId: input.userId,
      title: `${input.platform} conversation`,
      updatedAt: new Date(),
    },
  });
}

/**
 * Detach any existing mapping threads for a platform thread (rewrite the
 * metadata key the SDK filters on) so the next event resolves to a freshly
 * saved mapping instead. Used by /new and /link before re-pointing.
 */
async function detachMappingThreads(input: {
  externalThreadId: string;
  mastra: Mastra;
  platform: string;
}): Promise<void> {
  const memoryStore = await getGlobalMemoryStore(input.mastra);
  const { threads } = await memoryStore.listThreads({
    filter: {
      metadata: {
        [CHANNEL_MAPPING_KEYS.platform]: input.platform,
        [CHANNEL_MAPPING_KEYS.threadId]: input.externalThreadId,
      },
    },
    perPage: 10,
  });
  for (const thread of threads) {
    await memoryStore.saveThread({
      thread: {
        ...thread,
        metadata: {
          ...thread.metadata,
          [CHANNEL_MAPPING_KEYS.threadId]: `detached:${input.externalThreadId}:${Date.now()}`,
        },
        updatedAt: new Date(),
      },
    });
  }
}

/**
 * Provision the dedicated engenty thread backing a channel conversation:
 * ai.thread row (tenant-scoped, owned by the mapped user), SDK mapping thread
 * with the same UUID, and the conversations-row pointer via the attach op.
 */
async function ensureChannelThread(input: {
  channelId?: string;
  conversationId: string;
  deps: RemoteChannelDeps;
  externalThreadId: string;
  invoke: OperationInvoker;
  platform: string;
  tenantId: string;
  userId: string;
}): Promise<string> {
  const threadId = randomUUID();
  await input.deps.threadStore.upsertThread({
    agentId: ENGENTY_REMOTE_AGENT_ID,
    createdByUserId: input.userId,
    id: threadId,
    routeContext: {
      channel: {
        conversation_id: input.conversationId,
        external_thread_id: input.externalThreadId,
        platform: input.platform,
      },
    },
    tenantId: input.tenantId,
    title: `${input.platform} conversation`,
  });
  await saveMappingThread({
    aiThreadId: threadId,
    channelId: input.channelId,
    externalThreadId: input.externalThreadId,
    mastra: input.deps.mastra,
    platform: input.platform,
    userId: input.userId,
  });
  await input.invoke("remote_runtime_attach_thread", {
    ai_thread_id: threadId,
    conversation_id: input.conversationId,
  });
  return threadId;
}

// ── Chat controls (R3): /new · /threads · /link · /help ─────────────────────

export type ChannelCommand =
  | { kind: "help" }
  | { kind: "link"; threadRef: string }
  | { kind: "new" }
  | { kind: "threads" };

/**
 * Parse a leading-slash control message. Only exact known tokens are commands —
 * anything else (including unknown /words) passes through to the agent, so a
 * user pasting a path or writing "/shrug" isn't swallowed.
 */
export function parseChannelCommand(text: string): ChannelCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [token, ...rest] = trimmed.slice(1).split(/\s+/);
  switch (token?.toLowerCase()) {
    case "help":
      return { kind: "help" };
    case "link": {
      const threadRef = rest[0] ?? "";
      return { kind: "link", threadRef };
    }
    case "new":
      return { kind: "new" };
    case "threads":
      return { kind: "threads" };
    default:
      return null;
  }
}

const COMMAND_HELP = [
  "Chat controls:",
  "• /new — start a fresh conversation (this chat gets a new thread)",
  "• /threads — list your recent remote threads",
  "• /link <thread-id> — continue an existing engenty thread here",
  "• /help — this message",
].join("\n");

const UUID_REF_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleChannelCommand(input: {
  channelId?: string;
  command: ChannelCommand;
  conversationId: string;
  deps: RemoteChannelDeps;
  externalThreadId: string;
  invoke: OperationInvoker;
  platform: string;
  post: (text: string) => Promise<unknown>;
  tenantId: string;
  userId: string;
}): Promise<void> {
  const { command, deps } = input;
  switch (command.kind) {
    case "help": {
      await input.post(COMMAND_HELP);
      return;
    }
    case "new": {
      await detachMappingThreads({
        externalThreadId: input.externalThreadId,
        mastra: deps.mastra,
        platform: input.platform,
      });
      await ensureChannelThread({
        channelId: input.channelId,
        conversationId: input.conversationId,
        deps,
        externalThreadId: input.externalThreadId,
        invoke: input.invoke,
        platform: input.platform,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      await input.post("Started a fresh conversation.");
      return;
    }
    case "threads": {
      const sessions = await deps.threadStore.listThreadsForUser({
        agentId: ENGENTY_REMOTE_AGENT_ID,
        limit: 5,
        tenantId: input.tenantId,
        userId: input.userId,
      });
      if (sessions.length === 0) {
        await input.post("No remote threads yet.");
        return;
      }
      const lines = sessions.map(
        (s) => `• ${s.title ?? "(untitled)"} — ${s.id}`
      );
      await input.post(
        `Your recent remote threads:\n${lines.join("\n")}\nUse /link <thread-id> to continue one here.`
      );
      return;
    }
    case "link": {
      if (!UUID_REF_PATTERN.test(command.threadRef)) {
        await input.post("Usage: /link <thread-id> (see /threads for ids).");
        return;
      }
      // Ownership: the thread must exist in this tenant and belong to the
      // mapped user. This is the ONLY sanctioned way a remote conversation
      // attaches to a non-remote thread — explicit, user-typed.
      const session = await deps.threadStore.getThread({
        tenantId: input.tenantId,
        threadId: command.threadRef,
      });
      if (!session || session.created_by_user_id !== input.userId) {
        await input.post("Thread not found (or not yours).");
        return;
      }
      await detachMappingThreads({
        externalThreadId: input.externalThreadId,
        mastra: deps.mastra,
        platform: input.platform,
      });
      await saveMappingThread({
        aiThreadId: session.id,
        channelId: input.channelId,
        externalThreadId: input.externalThreadId,
        mastra: deps.mastra,
        platform: input.platform,
        userId: input.userId,
      });
      await input.invoke("remote_runtime_attach_thread", {
        ai_thread_id: session.id,
        conversation_id: input.conversationId,
      });
      await input.post(
        `Linked. This chat now continues "${session.title ?? session.id}".`
      );
      return;
    }
    default: {
      const exhaustive: never = command;
      throw new Error(`unhandled channel command: ${String(exhaustive)}`);
    }
  }
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
export function createIdentityGateHandler(
  deps?: RemoteChannelDeps
): ChannelHandler {
  // INTERIM (multi-tenant service identity): sender resolution is inherently
  // cross-tenant — the BINDING names the tenant, but a token is needed to
  // ask, and a platform-scoped credential refuses a tenant-less mint. Until
  // remote_runtime_resolve_sender gets a platform-level lane, it runs under
  // the installation's first tenant — exactly the pre-multi-tenant behavior,
  // where it rode the credential's own (default) tenant.
  let homeTenantId: string | null | undefined;
  const invoke: OperationInvoker = async (operationId, input) => {
    if (homeTenantId === undefined) {
      homeTenantId = await listTenantIds()
        .then((ids) => ids[0] ?? null)
        .catch(() => null);
    }
    return createSchedulerOperationInvoker(homeTenantId ?? undefined)(
      operationId,
      input
    );
  };
  return async (thread, message, defaultHandler) => {
    // Never react to our own or other bots' messages beyond Mastra's own
    // guards — cheap belt-and-suspenders for the gate's side effects.
    if (message.author.isMe) {
      return;
    }
    const platform =
      (thread as { adapterName?: string }).adapterName ?? "slack";
    const externalThreadId = (thread as { id?: string }).id;
    const channelId = (thread as { channelId?: string }).channelId;
    const isDm = Boolean((thread as { isDM?: boolean }).isDM);
    let resolved: ResolveSenderResult;
    try {
      resolved = await resolveSender(invoke, {
        displayName: message.author.fullName,
        externalEventId: (message as { id?: string }).id,
        externalThreadId,
        externalUserId: message.author.userId,
        externalWorkspaceId: extractExternalWorkspaceId(
          platform,
          (message as { raw?: unknown }).raw
        ),
        isDm,
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

    if (!resolved.fresh) {
      // Durable replay guard: this platform event id was already processed
      // (webhook retry, or a redelivery after a restart — Chat SDK's own dedup
      // is in-memory and would miss the latter).
      logger.info("remote channels: dropped replayed event", { platform });
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

    // Past this point the binding names the tenant — every further module
    // operation must ride a token minted for THAT tenant. The `invoke`
    // closure above is the resolveSender interim (first tenant) and would be
    // denied by RLS for every other tenant, killing thread provisioning and
    // chat controls outside tenant #1.
    const tenantInvoke: OperationInvoker = tenantId
      ? createSchedulerOperationInvoker(tenantId)
      : invoke;

    // R3 chat controls — mapped users only, handled before the agent (and
    // before any token mint: commands run on the session store directly).
    if (deps && resolved.conversation && tenantId && externalThreadId) {
      const command = parseChannelCommand(message.text ?? "");
      if (command) {
        try {
          await handleChannelCommand({
            channelId,
            command,
            conversationId: resolved.conversation.id,
            deps,
            externalThreadId,
            invoke: tenantInvoke,
            platform,
            post: (text) => thread.post(text),
            tenantId,
            userId,
          });
        } catch (error) {
          logger.error("remote channels: chat control failed", {
            message: error instanceof Error ? error.message : String(error),
          });
          await thread.post("That didn't work — please try again.");
        }
        return;
      }
    }

    // P5: who answers. A leading `@handle` / `/to handle`, else the binding's
    // default agent, else the front door. Decided before any thread work so a
    // per-agent turn never provisions the front door's thread as a side
    // effect.
    let target: RemoteTargetResolution = {
      kind: "front-door",
      text: message.text ?? "",
    };
    const registry =
      deps?.getRegistry && tenantId ? deps.getRegistry(tenantId) : null;
    if (registry) {
      try {
        target = await resolveRemoteTarget({
          bindingAgentId: resolved.binding.agent_id,
          listAgents: () => listRegistryAgents(registry),
          text: message.text ?? "",
        });
      } catch (error) {
        logger.warn("remote channels: target resolution failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (
        target.kind === "front-door" &&
        resolved.binding.agent_id &&
        resolved.binding.agent_id !== ENGENTY_REMOTE_AGENT_ID
      ) {
        logger.warn(
          "remote channels: binding names an agent that is not reachable; using the front door",
          { agentId: resolved.binding.agent_id, platform }
        );
      }
    }
    if (target.kind === "unreachable") {
      await thread.post(unreachableAgentReply(target.handle));
      return;
    }

    // R2: make sure the dedicated engenty thread backing this conversation
    // exists BEFORE the SDK resolves its mapping thread, so agent.stream runs
    // against our tenant-scoped thread id rather than an SDK-minted one.
    let aiThreadId = resolved.conversation?.ai_thread_id ?? null;
    if (
      target.kind === "front-door" &&
      deps &&
      resolved.conversation &&
      !resolved.conversation.ai_thread_id &&
      tenantId &&
      externalThreadId
    ) {
      try {
        aiThreadId = await ensureChannelThread({
          channelId,
          conversationId: resolved.conversation.id,
          deps,
          externalThreadId,
          invoke: tenantInvoke,
          platform,
          tenantId,
          userId,
        });
      } catch (error) {
        logger.error("remote channels: thread provisioning failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        await thread.post(
          "Something went wrong on my side — please try again in a moment."
        );
        return;
      }
    }

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

    // Agent attribution — REQUIRED for the approval story, not cosmetic.
    // Verified live 2026-08-04: without it, core sees the delegated actor
    // token as the user acting first-person and EXECUTED a high-risk
    // requiresApproval op (contacts_create) from a Slack DM with no approval
    // — model output, one unchecked hop from the platform. With the agent
    // forwarded (same shape as session-service.ts chat runs), core's
    // escalation policy treats the call as agent-authored and the "defer"
    // contract holds: durable approval request + approval_pending result.
    const answeringAgentId =
      target.kind === "agent" ? target.agent.id : ENGENTY_REMOTE_AGENT_ID;
    const coreAgentId = await resolveCoreAgentId(
      tenantId ?? "",
      answeringAgentId
    );

    // Per-Engenty turn: assembled as itself, its own thread per platform
    // thread, plain-text reply posted back. Same ALS scope as the front door
    // — the authority is still the paired user's token, the agent is the
    // attribution.
    const goalThreadId =
      target.kind === "agent" && tenantId
        ? remoteAgentThreadId({
            agentId: target.agent.id,
            externalThreadId: externalThreadId ?? channelId ?? "dm",
            platform,
            tenantId,
          })
        : aiThreadId;
    const runTurn =
      target.kind === "agent" && registry && deps && tenantId
        ? async () => {
            const agentTarget = target as Extract<
              RemoteTargetResolution,
              { kind: "agent" }
            >;
            try {
              const reply = await runRemoteAgentTurn({
                agent: agentTarget.agent,
                externalThreadId: externalThreadId ?? channelId ?? "dm",
                mastra: deps.mastra,
                platform,
                registry,
                tenantId,
                text: agentTarget.text,
                threadStore: deps.threadStore,
                userId,
              });
              await thread.post(reply);
            } catch (error) {
              logger.error("remote channels: agent turn failed", {
                agentId: agentTarget.agent.id,
                message: error instanceof Error ? error.message : String(error),
              });
              await thread.post(
                `${agentTarget.agent.name} could not answer right now — please try again in a moment.`
              );
            }
          }
        : () => defaultHandler(thread, message);

    await engentyToolsRunAls.run(
      {
        ...getEngentyToolsRunContext(),
        ...(coreAgentId ? { agentId: coreAgentId } : {}),
        agentTypeKey: answeringAgentId,
        approvalGrants: [],
        // "request": run the AI-side pre-gate; a gated op returns a structured
        // approval_pending WITHOUT executing, so the model tells the user and
        // the turn ends with a real reply. Both alternatives failed live:
        // - "suspend" (2026-08-03): parks in the in-process 15-min map and
        //   renders NO card — our approval suspension never emits Mastra's
        //   `tool-call-approval` chunk (the only thing Chat SDK renders
        //   buttons for). The Slack user stares at a spinning card forever.
        // - "defer" (2026-08-04): SKIPS the pre-gate, and with the delegated
        //   actor token the principal IS the user — core has never gated user
        //   principals (the web-chat Approve card is this pre-gate's UX, not
        //   core's), so a high-risk requiresApproval op EXECUTED from a Slack
        //   DM with no approval. Agent attribution alone did not change that.
        // In-place Approve/Deny + resume = ride Mastra's native tool-approval
        // flow, built on top of the unified approvals store (D2), not before.
        approvalPolicy: "request",
        // Approval grants persist against the goal; for channel turns that is
        // the backing engenty thread (mirrors chat runs using the thread id).
        // A per-Engenty turn has its own thread, so its grants live there.
        ...(goalThreadId ? { goalId: goalThreadId } : {}),
        tenantId: tenantId ?? null,
        userId,
        accessToken: actorToken,
      },
      runTurn
    );
  };
}

/** Every agent the registry knows, or none when it cannot list. */
async function listRegistryAgents(
  registry: AiRegistry
): Promise<AgentConfig[]> {
  const lister = registry as AiRegistry & {
    listAgentConfigs?: () => Promise<AgentConfig[]>;
  };
  return typeof lister.listAgentConfigs === "function"
    ? await lister.listAgentConfigs()
    : [];
}

// ── Agent + adapters ────────────────────────────────────────────────────────

/**
 * Build the persistent channel-bound engenty.remote Agent. Config (identity,
 * instructions, model, brevity contract) comes from the engenty-remote module;
 * tools are the same dynamic-dispatch catalog set the coordinator uses.
 * Adapters are added per configured platform.
 *
 * With `deps`, the agent's memory is a per-turn resolver bound to the tenant
 * scope the identity gate put on ALS — channel messages persist through
 * `EngentySessionMemoryStorage` into ai.thread / ai.thread_message exactly like
 * web-chat threads (the agent is a process singleton; the memory is not).
 * Without `deps` (tests), messages stay in the global Mastra store.
 */
export async function createRemoteChannelsAgent(
  deps?: RemoteChannelDeps
): Promise<Agent | null> {
  const remoteAgentConfig = await loadRemoteAgentConfig();
  if (!remoteAgentConfig) {
    return null;
  }
  return buildRemoteChannelsAgent(remoteAgentConfig, deps);
}

function buildRemoteChannelsAgent(
  remoteAgentConfig: AgentConfig,
  deps?: RemoteChannelDeps
): Agent {
  const gate = createIdentityGateHandler(deps);
  const adapters: Record<string, unknown> = {};
  for (const provider of configuredRemoteChannelProviders()) {
    adapters[provider.id] = provider.createAdapter();
  }
  const threadStore = deps?.threadStore;
  return new Agent({
    channels: {
      adapters: adapters as never,
      handlers: {
        onDirectMessage: gate,
        onMention: gate,
        onSubscribedMessage: gate,
      },
      // Memory owner for NEWLY created mapping threads (the SDK's own creation
      // path — normally we pre-create in the gate and this never fires): the
      // engenty user id, not the SDK default `${platform}:${platformUserId}`.
      // The tenant prefix is added inside the scoped storage.
      resolveResourceId: ({ defaultResourceId }) =>
        getEngentyToolsRunContext()?.userId ?? defaultResourceId,
    },
    id: ENGENTY_REMOTE_AGENT_ID,
    instructions: remoteAgentConfig.instructions,
    ...(threadStore
      ? {
          memory: () => {
            const ctx = getEngentyToolsRunContext();
            const tenantId = ctx?.tenantId;
            const userId = ctx?.userId;
            if (!(tenantId && userId)) {
              // The resolver only runs inside a turn, and every turn is
              // wrapped in the gate's ALS scope — reaching this means a
              // code path bypassed the identity gate. Fail loudly.
              throw new Error(
                "remote channels: memory requires the identity-gate turn scope"
              );
            }
            const storage = createEngentySessionMemoryStorage({
              agentId: ENGENTY_REMOTE_AGENT_ID,
              scope: { tenantId, userId },
              store: threadStore,
            });
            return createEngentySessionMastraMemory({ storage });
          },
        }
      : {}),
    // Per call: an unpinned config resolves the chat binding, loaded after boot.
    model: () => resolveAgentModel(remoteAgentConfig, undefined),
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
 * Webhook path shape: /ai/api/agents/engenty.remote/channels/{platform}/webhook
 * — Mastra's getWebhookRoutes() emits paths shaped for Mastra's own server
 * (/api/agents/…); we prefix them with AI_BASE_PATH so they ride the core
 * gateway's /ai proxy like every other apps/ai route. apps/ai itself is never
 * exposed directly (no published port in deployments).
 */
export async function registerRemoteChannels(
  app: Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>,
  input: {
    /** Per-tenant registry, so a bound or addressed Engenty answers as itself. */
    getRegistry?: (tenantId: string) => AiRegistry;
    mastra: Mastra;
    threadStore?: ThreadStore | null;
  }
): Promise<void> {
  if (!isRemoteChannelsEnabled()) {
    return;
  }
  // Platform check first, and silently: under opt-out this is the normal state
  // of every deployment that doesn't use remote channels, so a warning here
  // would be noise on the default path. Past it, the operator has configured a
  // platform and clearly wants this — so a missing credential IS worth a warning.
  if (!anyPlatformConfigured()) {
    return;
  }
  if (!isServiceCredentialConfigured()) {
    logger.warn(
      "remote channels: a platform is configured but no service credential is (ENGENTY_AI_SERVICE_SECRET); skipping"
    );
    return;
  }

  if (!input.threadStore) {
    logger.warn(
      "remote channels: no agent session store — channel threads will persist in the global Mastra store instead of tenant-scoped ai.thread"
    );
  }
  const agent = await createRemoteChannelsAgent(
    input.threadStore
      ? {
          ...(input.getRegistry ? { getRegistry: input.getRegistry } : {}),
          mastra: input.mastra,
          threadStore: input.threadStore,
        }
      : undefined
  );
  if (!agent) {
    logger.warn(
      "remote channels: @engenty/engenty-remote is not installed; skipping"
    );
    return;
  }
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
    const path = `${AI_BASE_PATH}${route.path}`;
    if (route.method === "ALL") {
      app.all(path, handler);
    } else {
      app.on(route.method, path, handler);
    }
    mounted += 1;
    logger.info(`remote channels: mounted ${route.method} ${path}`);
  }
  if (mounted === 0) {
    logger.warn("remote channels: no webhook routes to mount");
  }
}

// ── Proactive outbound consumer (remote_outbound queue) ─────────────────────

// binding_id is required: `remote_notify` only sets it after proving the
// thread belongs to the calling tenant, so a payload without one never passed
// that check (a pre-fix message still queued, or a write that bypassed the op)
// and must not be delivered. The authoritative check is at the operation —
// this is the structural guard on the far side of the process boundary.
/** Exported for tests. */
export const outboundPayloadSchema = z.object({
  binding_id: z.string().min(1),
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
  // Keyed on the runtime having actually registered (this runs after
  // registerRemoteChannels), not merely on the switch: under opt-out the switch
  // is on everywhere, and a consumer without a live Chat SDK would fail every
  // message instead of leaving it queued for a process that can deliver it.
  if (!activeAgent) {
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
