import type { InboxMessageStatus } from "../api.js";

export const INBOX_STATUS_BADGE_VARIANT: Record<
  InboxMessageStatus,
  "default" | "outline" | "secondary"
> = {
  archived: "outline",
  new: "default",
  read: "secondary",
};

/** Unread on the synced copy — classic mailbox "new". */
export function isInboxStatusUnread(
  status: InboxMessageStatus | null | undefined
): boolean {
  return status === "new";
}
