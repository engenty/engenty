import type {
  ConversationListItem,
  TeamChatMessage,
} from "../../src/schema/types.js";

/** Structural subset of user-management-ui's UserRecord (not exported there). */
export interface TenantUser {
  display_name: string;
  email?: string | null;
  id: string;
  initials?: string | null;
}

export type UsersById = Map<string, TenantUser>;

export function usersById(users: readonly TenantUser[] | undefined): UsersById {
  return new Map((users ?? []).map((user) => [user.id, user]));
}

export function userLabel(user: TenantUser | undefined, fallback: string) {
  if (!user) {
    return fallback;
  }
  return user.display_name || user.email || fallback;
}

/** #name for channels; member names for DMs (excluding the caller). */
export function conversationDisplayName(
  conversation: ConversationListItem,
  users: UsersById,
  currentUserId: string | null
): string {
  if (conversation.name) {
    return conversation.name;
  }
  const peers = conversation.members
    .filter(
      (member) =>
        member.principal_type !== "user" ||
        member.principal_id !== currentUserId
    )
    .map((member) =>
      member.principal_type === "user"
        ? userLabel(users.get(member.principal_id), "?")
        : member.principal_id
    );
  if (peers.length === 0) {
    // A DM with only yourself in it (notes-to-self).
    return userLabel(currentUserId ? users.get(currentUserId) : undefined, "…");
  }
  return peers.join(", ");
}

export function authorLabel(
  message: TeamChatMessage,
  users: UsersById
): string {
  if (message.user_id) {
    return userLabel(users.get(message.user_id), message.user_id.slice(0, 8));
  }
  if (message.agent_type_key) {
    return message.agent_type_key;
  }
  if (message.bot_id) {
    return message.bot_id;
  }
  return "system";
}

export function authorInitials(label: string): string {
  const parts = label.trim().split(/\s+/);
  const initials =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : (label.slice(0, 2) ?? "?");
  return initials.toUpperCase() || "?";
}

export function tsToDate(ts: string): Date {
  return new Date(Number.parseFloat(ts) * 1000);
}

export function formatMessageTime(ts: string, locale: string): string {
  return tsToDate(ts).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dayKey(ts: string): string {
  const date = tsToDate(ts);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function formatDayLabel(ts: string, locale: string): string {
  const date = tsToDate(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return locale.startsWith("de") ? "Heute" : "Today";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return locale.startsWith("de") ? "Gestern" : "Yesterday";
  }
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

/** Consecutive same-author messages within this window render grouped. */
export const GROUP_WINDOW_SECONDS = 5 * 60;

export function sameGroup(
  previous: TeamChatMessage | undefined,
  message: TeamChatMessage
): boolean {
  if (!previous || previous.subtype || message.subtype) {
    return false;
  }
  const sameAuthor =
    previous.user_id === message.user_id &&
    previous.agent_type_key === message.agent_type_key &&
    previous.bot_id === message.bot_id;
  return (
    sameAuthor &&
    Number.parseFloat(message.ts) - Number.parseFloat(previous.ts) <
      GROUP_WINDOW_SECONDS &&
    dayKey(previous.ts) === dayKey(message.ts)
  );
}

/**
 * Render mention tokens as readable text for the Phase 1 markdown renderer:
 * `<@u:uuid>` → **@Name**, `<@agent:key>` → **@key**, `<!here>` → **@here**.
 * Chip rendering replaces this in Phase 2.
 */
export function renderMentionTokens(text: string, users: UsersById): string {
  return text
    .replace(/<@u:([0-9a-fA-F-]{36})>/g, (_, id: string) => {
      const user = users.get(id.toLowerCase());
      return `**@${userLabel(user, id.slice(0, 8))}**`;
    })
    .replace(/<@agent:([a-z0-9][a-z0-9._-]*)>/g, "**@$1**")
    .replace(/<!(here|channel)>/g, "**@$1**");
}
