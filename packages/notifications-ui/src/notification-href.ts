import type { NotificationDto } from "./api.js";

/**
 * Where the row leads: the target the server stored at emit time, built with
 * the record's own space. Null when the record names nothing to open.
 */
export function notificationHref(notification: NotificationDto): string | null {
  return notification.target?.startsWith("/") ? notification.target : null;
}

/** Who asked and where, off the origin keys the producer stamped (v4 §2.1). */
export function notificationOrigin(notification: NotificationDto): {
  actorLabel: string | null;
  spaceKey: string | null;
  spaceName: string | null;
} {
  const read = (key: string) => {
    const value = notification.metadata?.[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    actorLabel: read("actor_label"),
    spaceKey: read("space_key"),
    spaceName: read("space_name"),
  };
}
