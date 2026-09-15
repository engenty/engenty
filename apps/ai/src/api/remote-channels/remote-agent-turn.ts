/**
 * One channel turn answered by a specific Engenty — not the front door.
 *
 * The agent is assembled the way its desk assembles it: registry config
 * (tools, skills, instructions) and its own memory (MEMORY.md, TASKS.md,
 * observations). What differs from a desk turn is the surface: no browser, so
 * no frontend tools; a messenger, so the reply is plain text posted back; and
 * no workspace mounts yet — a channel turn has no run to root a sandbox or
 * `/home` in, so file work still happens on the desk (the agent can say so).
 *
 * Thread: one per (tenant, platform thread, agent). Two Engenties addressed
 * from the same Slack thread keep two conversations — each remembers what it
 * said, neither reads the other's — and the id is derived, so the row is
 * found again without a lookup table.
 */

import { createHash } from "node:crypto";
import type { AgentConfig } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import { createEngentySessionMemoryRuntime } from "../../ai/memory/invocation-options.js";
import {
  type AiRegistry,
  assembleDynamicAgent,
} from "../../ai/registry/index.js";
import { resolveAgentMaxSteps } from "../../ai/sessions/max-steps.js";
import type { ThreadStore } from "../../dal/threads/index.js";

const logger = createLogger({ name: "remote-agent-turn" });

/** Stable UUID for (tenant, platform, platform thread, agent). */
export function remoteAgentThreadId(input: {
  agentId: string;
  externalThreadId: string;
  platform: string;
  tenantId: string;
}): string {
  const digest = createHash("sha1")
    .update(
      [
        "engenty-remote-agent-thread",
        input.tenantId,
        input.platform,
        input.externalThreadId,
        input.agentId,
      ].join("\u0000")
    )
    .digest("hex");
  // RFC 4122 shape (version nibble 5, variant 10xx) so every uuid column and
  // client-side guard accepts it. Variant nibble is 8–b; map the digest
  // nibble through a table instead of bitwise ops (Biome forbids those).
  const variantNibble = "89ab89ab89ab89ab"[
    Number.parseInt(digest.slice(16, 17), 16)
  ];
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variantNibble}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

export interface RemoteAgentTurnInput {
  agent: AgentConfig;
  externalThreadId: string;
  mastra: Mastra;
  platform: string;
  registry: AiRegistry;
  tenantId: string;
  text: string;
  threadStore: ThreadStore;
  userId: string;
}

const EMPTY_PROMPT_FALLBACK = "Hello.";
const REPLY_MAX_CHARS = 3800;

function trimReply(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= REPLY_MAX_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, REPLY_MAX_CHARS - 1)}…`;
}

/**
 * Assemble the Engenty, run the turn against its channel thread, return the
 * reply text. Throws on assembly or model failure; the caller decides what
 * the person sees.
 */
export async function runRemoteAgentTurn(
  input: RemoteAgentTurnInput
): Promise<string> {
  const threadId = remoteAgentThreadId({
    agentId: input.agent.id,
    externalThreadId: input.externalThreadId,
    platform: input.platform,
    tenantId: input.tenantId,
  });
  // Idempotent: the RPC re-saves the same row on every turn, keeping the
  // route context that marks it a channel thread for the lists.
  await input.threadStore.upsertThread({
    agentId: input.agent.id,
    createdByUserId: input.userId,
    id: threadId,
    routeContext: {
      channel: {
        external_thread_id: input.externalThreadId,
        platform: input.platform,
        via: "remote-agent",
      },
    },
    tenantId: input.tenantId,
    title: `${input.platform} · ${input.agent.name}`,
  });

  const memoryRuntime = createEngentySessionMemoryRuntime({
    agentId: input.agent.id,
    agentName: input.agent.name,
    scope: { tenantId: input.tenantId, userId: input.userId },
    store: input.threadStore,
    threadId,
  });

  // `memory_note` / `todo_edit` — the pads the desk turn also carries.
  const extraTools = { ...memoryRuntime.memoryTools };
  const agent = await assembleDynamicAgent(input.registry, input.agent.id, {
    ...(Object.keys(extraTools).length > 0 ? { extraTools } : {}),
    mastra: input.mastra,
    memory: memoryRuntime.memory,
    memoryProcessors: memoryRuntime.memoryProcessors,
    resolveContext: {
      tenantId: input.tenantId,
      threadId,
      userId: input.userId,
    },
  });

  const result = await agent.generate(
    input.text.trim() || EMPTY_PROMPT_FALLBACK,
    {
      maxSteps: resolveAgentMaxSteps(input.agent.limits?.max_steps ?? null),
      ...memoryRuntime.invocationOptions,
    }
  );
  const text = trimReply(result.text ?? "");
  if (!text) {
    logger.warn("remote agent turn produced no text", {
      agentId: input.agent.id,
      platform: input.platform,
    });
    return "I have nothing to add right now.";
  }
  return text;
}
