import type { ConversationMember, MentionRecord } from "../schema/types.js";

/**
 * User notification targets for a posted message: the module has the members
 * with their prefs and read state, so it decides WHO is notified and why; the
 * records themselves are written through the platform notification host
 * (gateway-methods.ts), and a member advancing their read cursor flips the
 * ones they have now seen.
 */
/** Why a user is notified; `mention` wins over `dm`/`thread`/`activity`. */
export type NotificationReason = "activity" | "dm" | "mention" | "thread";

export interface NotificationTarget {
  reason: NotificationReason;
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
