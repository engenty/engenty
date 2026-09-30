// Lanes, read off the record's class (derived server-side from the registered
// kind, so no consumer keeps a kind list of its own).
//
// - attention — Notifications: every open record that needs a person
//   (`isAttention`)
// - hitl      — decision (a run is parked) and todo (a person is asked)
// - errors    — alert
// - updates   — an ordinary update (FYI). A high/urgent update needs a
//   person, so it is a notification, not an update.
//
// Keep `isAttention` in this file. A *value* import from
// `@engenty/notifications` pulls the Node package (web-push) into the UI
// bundle and blanks the app. Mirror `packages/notifications/src/contracts.ts`.
import type { NotificationDto } from "./api.js";

/**
 * "Needs attention": an OPEN decision or todo until it is handled, or an
 * alert or high/urgent update this person has not seen yet — seeing an FYI
 * is handling it. Mirrors `isAttention` in `@engenty/notifications`.
 */
export function isAttention(
  record: Pick<NotificationDto, "class" | "priority" | "status"> & {
    seen?: boolean;
  }
): boolean {
  if (record.status !== "pending") {
    return false;
  }
  if (record.class === "decision" || record.class === "todo") {
    return true;
  }
  if (record.seen) {
    return false;
  }
  if (record.class !== "update") {
    return true;
  }
  return record.priority === "high" || record.priority === "urgent";
}

export type NotificationLaneFilter =
  | "all"
  | "attention"
  | "hitl"
  | "errors"
  | "updates";

export function isHitl(notification: NotificationDto): boolean {
  return notification.class === "decision" || notification.class === "todo";
}

export function isError(notification: NotificationDto): boolean {
  return notification.class === "alert";
}

/** Open and not yet looked at by this person. */
export function isUnseen(notification: NotificationDto): boolean {
  return notification.status === "pending" && !notification.seen;
}

/**
 * Leaves the attention lane by ✕ (dismiss): an alert or an attention FYI.
 * A decision is answered and a todo is closed by its subject — neither is
 * dismissed from a list.
 */
export function isDismissible(notification: NotificationDto): boolean {
  return (
    notification.class === "alert" ||
    (notification.class === "update" && isAttention(notification))
  );
}

export function matchesLaneFilter(
  notification: NotificationDto,
  filter: NotificationLaneFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "attention") {
    return isAttention(notification);
  }
  if (filter === "hitl") {
    return isHitl(notification);
  }
  if (filter === "errors") {
    return isError(notification);
  }
  return notification.class === "update" && !isAttention(notification);
}

/**
 * Which stack a record joins: its agent (macOS stacks by app — here the
 * agent is the app), else its kind. Space is part of the key, so one agent
 * working in two spaces is two stacks in the tenant view.
 */
export function stackKeyOf(notification: NotificationDto): string {
  const actor =
    typeof notification.metadata?.actor_ref === "string"
      ? notification.metadata.actor_ref
      : notification.actor_id
        ? `${notification.actor_kind ?? "agent"}:${notification.actor_id}`
        : `kind:${notification.kind}`;
  return `${actor}|${notification.space_id ?? ""}`;
}

export interface NotificationStackGroup {
  items: NotificationDto[];
  key: string;
}

/** Rows (newest first) → stacks, ordered by each stack's newest row. */
export function groupIntoStacks(
  notifications: readonly NotificationDto[]
): NotificationStackGroup[] {
  const groups: NotificationStackGroup[] = [];
  const byKey = new Map<string, NotificationStackGroup>();
  for (const notification of notifications) {
    const key = stackKeyOf(notification);
    const open = byKey.get(key);
    if (open) {
      open.items.push(notification);
      continue;
    }
    const group = { items: [notification], key };
    groups.push(group);
    byKey.set(key, group);
  }
  return groups;
}

/**
 * Whether a person can mark the row as seen from a card, a stack or a
 * section: an unseen row that is not a decision — a decision stays until
 * someone answers it.
 */
export function canMarkSeen(notification: NotificationDto): boolean {
  return isUnseen(notification) && notification.class !== "decision";
}

/** Agent id → its open attention records (`actor_kind` agent only). */
export function groupAttentionByAgent(
  notifications: readonly NotificationDto[]
): Map<string, NotificationDto[]> {
  const byAgent = new Map<string, NotificationDto[]>();
  for (const notification of notifications) {
    if (
      notification.actor_kind !== "agent" ||
      !notification.actor_id ||
      !isAttention(notification)
    ) {
      continue;
    }
    const rows = byAgent.get(notification.actor_id) ?? [];
    rows.push(notification);
    byAgent.set(notification.actor_id, rows);
  }
  return byAgent;
}
