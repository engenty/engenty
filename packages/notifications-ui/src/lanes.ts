import type { NotificationDto } from "./api.js";

export { isUnseen } from "./classification.js";

/** Classes that count on badges and wake client channels; `update` is FYI. */
export function isBadgeClass(record: NotificationDto): boolean {
  return record.class !== "update";
}
