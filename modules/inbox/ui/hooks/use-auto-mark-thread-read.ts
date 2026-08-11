import { useEffect, useRef } from "react";
import type { InboxThreadDetail } from "../api.js";
import { useSetMessageStatusMutation } from "../queries.js";

/**
 * When a human opens a thread, flip every still-`new` message to `read`.
 *
 * Claimed once per open of a given thread id so Mark as unread does not
 * immediately bounce back to read while the same thread stays open. Leaving
 * and re-opening runs the auto-read again (Gmail-style). Silent — no toast.
 * Agents never hit this path; they only change status via `inbox_set_status`.
 */
export function useAutoMarkThreadRead(
  threadId: string | null,
  detail: InboxThreadDetail | null | undefined
): void {
  const { mutate } = useSetMessageStatusMutation();
  const claimedThreadId = useRef<string | null>(null);

  useEffect(() => {
    if (!(threadId && detail) || detail.thread.id !== threadId) {
      return;
    }
    if (claimedThreadId.current === threadId) {
      return;
    }

    const unreadIds = detail.messages
      .filter((message) => message.status === "new")
      .map((message) => message.id);

    // Claim before mutate so a refetch mid-flight cannot double-fire, and so
    // Mark as unread on this open does not re-trigger auto-read.
    claimedThreadId.current = threadId;

    if (unreadIds.length === 0) {
      return;
    }

    mutate({ ids: unreadIds, status: "read" });
  }, [detail, mutate, threadId]);
}
