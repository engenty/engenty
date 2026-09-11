// Which records a space shows.
//
// A record stamped with a space belongs to that space. A record with no space
// is tenant-global: a decision, alert or todo there is a blocker wherever the
// person stands, so every space shows it; a global `update` is FYI and shows
// on the tenant page only — repeated in every space it is noise.
import type { NotificationRecord } from "./contracts.js";

export function visibleInSpace(
  record: Pick<NotificationRecord, "class" | "space_id">,
  spaceId: string
): boolean {
  if (record.space_id === spaceId) {
    return true;
  }
  return record.space_id === null && record.class !== "update";
}
