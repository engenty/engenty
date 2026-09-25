// Lanes, read off the record's class (derived server-side from the registered
// kind, so no consumer keeps a kind list of its own).
//
// - attention — Wichtig: every open record that needs a person (`isAttention`)
// - hitl      — decision (a run is parked) and todo (a person is asked)
// - errors    — alert
// - updates   — update (FYI). High/urgent updates stay here; they are also
//   in the attention lane.
//
// Keep `isAttention` in this file. A *value* import from
// `@engenty/notifications` pulls the Node package (web-push) into the UI
// bundle and blanks the app. Mirror `packages/notifications/src/contracts.ts`.
import type { NotificationDto } from "./api.js";

/**
 * "Needs attention" (Wichtig): an OPEN record that is a decision, todo or
 * alert, or a high/urgent update — seen or not. It counts until handled: a
 * decision until resolved, an FYI until dismissed.
 */
export function isAttention(
  record: Pick<NotificationDto, "class" | "priority" | "status">
): boolean {
  if (record.status !== "pending") {
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
  return notification.class === "update";
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
