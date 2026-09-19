// Which records a space shows: only rows stamped with that space. Tenant-global
// rows (no space) belong on All, not repeated in every space inbox.
import type { NotificationRecord } from "./contracts.js";

export function visibleInSpace(
  record: Pick<NotificationRecord, "space_id">,
  spaceId: string
): boolean {
  return record.space_id === spaceId;
}

/**
 * `scope=space` on the list: this space's rows, or nothing when the request
 * named no space. Never fall through to the tenant aggregate — that is
 * `scope=tenant`.
 */
export function notificationsInSpaceScope<
  T extends Pick<NotificationRecord, "space_id">,
>(records: readonly T[], spaceId: string | null | undefined): T[] {
  if (!spaceId) {
    return [];
  }
  return records.filter((record) => visibleInSpace(record, spaceId));
}
