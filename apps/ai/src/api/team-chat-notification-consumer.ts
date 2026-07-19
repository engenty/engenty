// The team_chat_notification consumer (team-chat N1): the module enqueues one
// dispatch per posted message with precomputed targets (module side:
// modules/team-chat/src/api/notification-queue.ts); this consumer writes one
// platform-inbox record per target onto the user's inbox partition
// (`inbox:{tenant}:{user}`), and flips records back to `seen` when the
// member's read cursor advances past the message ("read" dispatches). Queue
// name inlined so apps/ai keeps no build-time dependency on
// @engenty/team-chat (same contract style as the agent-mention consumer).
import type { QueueService } from "@engenty/queue";
import { startQueueWorker } from "@engenty/queue";
import { createLogger } from "@engenty/telemetry";
import { z } from "zod";
import {
  emitInboxNotification,
  markInboxNotificationsSeenWhere,
} from "../notifications/inbox.js";

const logger = createLogger({ name: "team-chat-notification-consumer" });

const TEAM_CHAT_NOTIFICATION_QUEUE = "team_chat_notification";

const messageDispatchSchema = z.object({
  author_agent_key: z.string().nullable(),
  author_user_id: z.string().nullable(),
  conversation_id: z.string().min(1),
  conversation_name: z.string().nullable(),
  conversation_type: z.string().min(1),
  kind: z.literal("message"),
  message_ts: z.string().min(1),
  targets: z.array(
    z.object({
      reason: z.enum(["activity", "dm", "mention", "thread"]),
      user_id: z.string().min(1),
    })
  ),
  tenant_id: z.string().min(1),
  text_preview: z.string(),
  thread_ts: z.string().nullable(),
});

const readDispatchSchema = z.object({
  conversation_id: z.string().min(1),
  kind: z.literal("read"),
  tenant_id: z.string().min(1),
  up_to_ts: z.string().min(1),
  user_id: z.string().min(1),
});

const dispatchSchema = z.discriminatedUnion("kind", [
  messageDispatchSchema,
  readDispatchSchema,
]);

function conversationLabel(
  dispatch: z.infer<typeof messageDispatchSchema>
): string {
  return dispatch.conversation_name
    ? `#${dispatch.conversation_name}`
    : "a direct message";
}

function summaryFor(
  dispatch: z.infer<typeof messageDispatchSchema>,
  reason: "activity" | "dm" | "mention" | "thread"
): string {
  const label = conversationLabel(dispatch);
  const preview = dispatch.text_preview ? `: ${dispatch.text_preview}` : "";
  switch (reason) {
    case "mention":
      return `Mentioned in ${label}${preview}`;
    case "dm":
      return `New direct message${preview}`;
    case "thread":
      return `New reply in ${label}${preview}`;
    default:
      return `New message in ${label}${preview}`;
  }
}

async function handleDispatch(payload: Record<string, unknown>): Promise<void> {
  const dispatch = dispatchSchema.parse(payload);
  if (dispatch.kind === "read") {
    const updated = await markInboxNotificationsSeenWhere({
      predicate: (notification) => {
        const conversationId = notification.payload?.conversation_id;
        const ts = notification.payload?.message_ts;
        return (
          notification.source === "team-chat" &&
          conversationId === dispatch.conversation_id &&
          typeof ts === "string" &&
          Number(ts) <= Number(dispatch.up_to_ts)
        );
      },
      tenantId: dispatch.tenant_id,
      userId: dispatch.user_id,
    });
    if (updated > 0) {
      logger.info("team-chat read-sync marked notifications seen", {
        conversationId: dispatch.conversation_id,
        updated,
        userId: dispatch.user_id,
      });
    }
    return;
  }
  for (const target of dispatch.targets) {
    await emitInboxNotification({
      dedupeKey: `team-chat:${dispatch.conversation_id}:${dispatch.message_ts}:${target.user_id}`,
      kind: "team_chat.message",
      metadata: { reason: target.reason },
      payload: {
        author_agent_key: dispatch.author_agent_key,
        author_user_id: dispatch.author_user_id,
        conversation_id: dispatch.conversation_id,
        conversation_label: conversationLabel(dispatch),
        conversation_type: dispatch.conversation_type,
        message_ts: dispatch.message_ts,
        route: `/mdl/team-chat/${dispatch.conversation_id}?ts=${dispatch.message_ts}`,
        text_preview: dispatch.text_preview,
        thread_ts: dispatch.thread_ts,
      },
      priority: target.reason === "mention" ? "high" : "medium",
      source: "team-chat",
      summary: summaryFor(dispatch, target.reason),
      tenantId: dispatch.tenant_id,
      userId: target.user_id,
    });
  }
}

export interface StartTeamChatNotificationConsumerOptions {
  pollIntervalMs?: number;
  queue: QueueService;
}

export function isTeamChatNotificationsEnabled(): boolean {
  return process.env.ENGENTY_TEAM_CHAT_NOTIFICATIONS_ENABLED !== "false";
}

export function startTeamChatNotificationConsumer(
  options: StartTeamChatNotificationConsumerOptions
): () => void {
  if (!isTeamChatNotificationsEnabled()) {
    logger.info(
      "team-chat notification consumer disabled (ENGENTY_TEAM_CHAT_NOTIFICATIONS_ENABLED)"
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
  handlers.set(TEAM_CHAT_NOTIFICATION_QUEUE, async (payload, meta) => {
    try {
      await handleDispatch(payload);
    } catch (err) {
      logger.error("team-chat notification dispatch failed", {
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
  logger.info("team-chat notification consumer started", {
    queue: TEAM_CHAT_NOTIFICATION_QUEUE,
  });
  return stop;
}
