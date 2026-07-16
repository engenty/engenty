import type { InboxMessageStatus } from "../api.js";

export const INBOX_STATUS_BADGE_VARIANT: Record<
  InboxMessageStatus,
  "default" | "outline" | "secondary"
> = {
  archived: "outline",
  new: "default",
  processed: "secondary",
  triaged: "secondary",
};

export function isInboxStatusUnhandled(
  status: InboxMessageStatus | null | undefined
): boolean {
  return status === "new" || status === "triaged";
}
