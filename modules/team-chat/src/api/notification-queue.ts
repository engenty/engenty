import type { QueueServiceLike } from "@engenty/plugin-sdk";
import type { ConversationMember, MentionRecord } from "../schema/types.js";

/**
 * User notification fan-out (N1). One queue dispatch per posted message with
 * the notification targets precomputed here (the module has the members with
 * prefs and read state; the apps/ai consumer only writes inbox records), plus
 * a read-sync dispatch when a member advances their read cursor so pending
 * inbox records for messages they've now seen flip to `seen`.
 * Queue name is inlined on the consumer side (apps/ai keeps no build-time
 * dependency on @engenty/team-chat, same contract style as agent mentions).
 */
export const TEAM_CHAT_NOTIFICATION_QUEUE = "team_chat_notification";

/** Why a user is notified; `mention` wins over `dm`/`thread`/`activity`. */
export type NotificationReason = "activity" | "dm" | "mention" | "thread";

export interface NotificationTarget {
  reason: NotificationReason;
  user_id: string;
}

export interface MessageNotificationDispatch {
  author_agent_key: string | null;
  author_user_id: string | null;
  conversation_id: string;
  conversation_name: string | null;
  conversation_type: string;
  kind: "message";
  message_ts: string;
  targets: NotificationTarget[];
  tenant_id: string;
  /** Mention tokens folded to readable placeholders, whitespace collapsed. */
  text_preview: string;
  thread_ts: string | null;
}

export interface ReadSyncDispatch {
  conversation_id: string;
  kind: "read";
  tenant_id: string;
  /** Read cursor: records for messages with ts <= this flip to seen. */
  up_to_ts: string;
  user_id: string;
}

/** Notification preview: readable stand-ins for mention tokens, one line. */
export function notificationPreview(text: string): string {
  return text
    .replace(/<@u:[0-9a-fA-F-]{36}>/g, "@user")
    .replace(/<@agent:([a-z0-9][a-z0-9._-]*)>/g, "@$1")
    .replace(/<!(here|channel)>/g, "@$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

/**
 * Slack-shaped notify semantics: `notify_prefs.level` overrides the type
 * default (channels → mentions, DMs → all); `muted` and `nothing` silence
 * everything; @here/@channel count as mentions; thread participants (root
 * author + repliers) are notified about replies regardless of level.
 */
export function computeMessageNotificationTargets(input: {
  authorUserId: string | null;
  conversationType: string;
  members: ConversationMember[];
  mentions: MentionRecord[];
  threadParticipants?: string[];
}): NotificationTarget[] {
  const isDm =
    input.conversationType === "im" || input.conversationType === "mpim";
  const broadcast = input.mentions.some(
    (mention) => mention.kind === "channel" || mention.kind === "here"
  );
  const mentioned = new Set(
    input.mentions
      .filter((mention) => mention.kind === "user" && mention.target_id)
      .map((mention) => mention.target_id as string)
  );
  const inThread = new Set(input.threadParticipants ?? []);

  const targets: NotificationTarget[] = [];
  for (const member of input.members) {
    if (
      member.principal_type !== "user" ||
      member.principal_id === input.authorUserId ||
      member.muted
    ) {
      continue;
    }
    const level =
      typeof member.notify_prefs.level === "string"
        ? member.notify_prefs.level
        : isDm
          ? "all"
          : "mentions";
    if (level === "nothing") {
      continue;
    }
    const reason: NotificationReason | null =
      mentioned.has(member.principal_id) || broadcast
        ? "mention"
        : isDm
          ? "dm"
          : inThread.has(member.principal_id)
            ? "thread"
            : level === "all"
              ? "activity"
              : null;
    if (reason) {
      targets.push({ reason, user_id: member.principal_id });
    }
  }
  return targets;
}

export async function enqueueNotificationDispatch(
  queue: QueueServiceLike | null,
  dispatch: MessageNotificationDispatch | ReadSyncDispatch
): Promise<void> {
  if (
    !queue ||
    (dispatch.kind === "message" && dispatch.targets.length === 0)
  ) {
    return;
  }
  await queue.send(TEAM_CHAT_NOTIFICATION_QUEUE, dispatch);
}
