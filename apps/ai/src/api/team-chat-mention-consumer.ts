// The team_chat_agent_mention consumer (team-chat Phase 3). An @-mentioned
// agent in a channel message becomes a queue dispatch (module side:
// modules/team-chat/src/api/agent-mention-queue.ts); this consumer runs the
// agent headless on the thread context (runDelegatedConversation — the same
// leaf-run primitive the task job uses) and posts the durable reply back into
// the channel via the team_chat_post_as_agent operation, linking the channel
// thread to the agent's ai.thread. Queue name inlined so apps/ai keeps no
// build-time dependency on @engenty/team-chat (same contract style as
// agent_task_dispatch).
import { randomUUID } from "node:crypto";
import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import { createDefaultAiRegistry } from "../ai/agents.js";
import { runDelegatedConversation } from "../ai/conversation/delegate-run.js";
import {
  createRegistryStoreFromEnv,
  createThreadStoreFromEnv,
} from "../ai/index.js";
import { resolveTaskJobServiceScope } from "../ai/jobs/task-job-scope.js";
import { createDefaultModuleCapabilityLoader } from "../ai/module-capability-loader.js";
import { createSchedulerOperationInvoker } from "../scheduler/service-invoker.js";

const logger = createLogger({ name: "team-chat-mention-consumer" });

const TEAM_CHAT_AGENT_MENTION_QUEUE = "team_chat_agent_mention";

const mentionDispatchSchema = z.object({
  agent_type_key: z.string().min(1),
  conversation_id: z.string().min(1),
  message_ts: z.string().min(1),
  tenant_id: z.string().min(1),
  thread_ts: z.string().min(1),
});

interface ThreadContextMessage {
  agent_type_key: string | null;
  subtype: string | null;
  text: string;
  ts: string;
  user_id: string | null;
}

function renderContext(messages: ThreadContextMessage[]): string {
  return messages
    .filter((message) => !message.subtype)
    .map((message) => {
      const author = message.user_id
        ? `user:${message.user_id}`
        : (message.agent_type_key ?? "system");
      return `[${author}] ${message.text}`;
    })
    .join("\n");
}

async function handleMentionDispatch(
  payload: Record<string, unknown>
): Promise<void> {
  const dispatch = mentionDispatchSchema.parse(payload);
  const scope = await resolveTaskJobServiceScope(dispatch.tenant_id);
  const invoke = createSchedulerOperationInvoker(dispatch.tenant_id);

  const [replies, info] = await Promise.all([
    invoke("team_chat_conversations_replies", {
      channel: dispatch.conversation_id,
      limit: 30,
      ts: dispatch.thread_ts,
    }) as Promise<{ messages: ThreadContextMessage[] }>,
    invoke("team_chat_conversations_info", {
      channel: dispatch.conversation_id,
    }) as Promise<{
      conversation: { name: string | null; topic: string | null };
    }>,
  ]);

  const channelLabel = info.conversation.name
    ? `#${info.conversation.name}`
    : "a direct message";
  const brief = [
    `You were @-mentioned in the team-chat conversation ${channelLabel}` +
      (info.conversation.topic ? ` (topic: ${info.conversation.topic})` : "") +
      ".",
    "Conversation thread so far (oldest first; `<@u:UUID>` tokens are user mentions):",
    renderContext(replies.messages ?? []),
    "Write the reply that should be posted into this thread. Reply with the message text only — no preamble, no quoting of this brief. You may mention users with `<@u:UUID>` tokens and use markdown.",
  ].join("\n\n");

  const store = createThreadStoreFromEnv();
  if (!store) {
    throw new Error("team-chat mention: agent session store not configured");
  }
  const registry = createDefaultAiRegistry({
    databaseStore: createRegistryStoreFromEnv(),
    moduleLoader: createDefaultModuleCapabilityLoader(),
    tenantId: dispatch.tenant_id,
  });
  // Stable per (conversation, thread, agent): repeat mentions in the same
  // thread continue one ai.thread, so the agent keeps its memory of it.
  const childThreadId = `teamchat-${dispatch.conversation_id}-${dispatch.thread_ts}-${dispatch.agent_type_key}`;

  const result = await runDelegatedConversation({
    approvalPolicy: "defer",
    brief,
    childAgentId: dispatch.agent_type_key,
    childRunId: randomUUID(),
    childThreadId,
    registry,
    scope,
    store,
  });

  if (result.error || !result.finalText.trim()) {
    logger.error("team-chat mention run failed", {
      agentTypeKey: dispatch.agent_type_key,
      conversationId: dispatch.conversation_id,
      error: result.error ?? "empty final text",
      threadTs: dispatch.thread_ts,
    });
    return;
  }

  await invoke("team_chat_post_as_agent", {
    agent_type_key: dispatch.agent_type_key,
    ai_thread_id: childThreadId,
    channel: dispatch.conversation_id,
    text: result.finalText,
    thread_ts: dispatch.thread_ts,
  });
  logger.info("team-chat mention answered", {
    agentTypeKey: dispatch.agent_type_key,
    conversationId: dispatch.conversation_id,
    threadTs: dispatch.thread_ts,
  });
}

export interface StartTeamChatMentionConsumerOptions {
  pollIntervalMs?: number;
  queue: QueueService;
}

/** Mention dispatch shares the task-dispatch kill-switch semantics. */
export function isTeamChatMentionDispatchEnabled(): boolean {
  return process.env.ENGENTY_TEAM_CHAT_MENTIONS_ENABLED !== "false";
}

export function startTeamChatMentionConsumer(
  options: StartTeamChatMentionConsumerOptions
): () => void {
  if (!isTeamChatMentionDispatchEnabled()) {
    logger.info(
      "team-chat mention consumer disabled (ENGENTY_TEAM_CHAT_MENTIONS_ENABLED)"
    );
    return () => {
      // nothing to stop
    };
  }
  const handlers = new Map<
    string,
    (
      payload: Record<string, unknown>,
      meta: { msgId: number; readCount: number }
    ) => Promise<void>
  >();
  handlers.set(TEAM_CHAT_AGENT_MENTION_QUEUE, async (payload, meta) => {
    try {
      await handleMentionDispatch(payload);
    } catch (err) {
      logger.error("team-chat mention dispatch failed", {
        message: err instanceof Error ? err.message : String(err),
        msgId: meta.msgId,
      });
    }
  });
  const stop = startQueueWorker({
    handlers,
    queue: options.queue,
    ...(options.pollIntervalMs
      ? { pollIntervalMs: options.pollIntervalMs }
      : {}),
  });
  logger.info("team-chat mention consumer started", {
    queue: TEAM_CHAT_AGENT_MENTION_QUEUE,
  });
  return stop;
}
