// Lanes, read off the record's class (derived server-side from the registered
// kind, so no consumer keeps a kind list of its own).
//
// - hitl    — decision (a run is parked) and todo (a person is asked)
// - errors  — alert
// - updates — update (FYI)
import type { NotificationDto } from "./api.js";

export type NotificationLaneFilter = "all" | "hitl" | "errors" | "updates";

export function isHitl(notification: NotificationDto): boolean {
  return notification.class === "decision" || notification.class === "todo";
}

export function isError(notification: NotificationDto): boolean {
  return notification.class === "alert";
}

/** Anything a person must act on: decisions, todos and alerts. */
export function isNeedsInput(notification: NotificationDto): boolean {
  return notification.class !== "update";
}

/** Open and not yet looked at by this person. */
export function isUnseen(notification: NotificationDto): boolean {
  return notification.status === "pending" && !notification.seen;
}

export function matchesLaneFilter(
  notification: NotificationDto,
  filter: NotificationLaneFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "hitl") {
    return isHitl(notification);
  }
  if (filter === "errors") {
    return isError(notification);
  }
  return notification.class === "update";
}

/** Open HITL items — what a "needs you" badge counts. */
export function countOpenHitl(notifications: NotificationDto[]): number {
  return notifications.filter((n) => isHitl(n) && isUnseen(n)).length;
}
