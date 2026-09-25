// Open the rail bell's inbox from anywhere — the dashboard's "All (n)", a
// per-agent "2 important" pill. The rail bell is mounted once per shell and
// is the only listener, so a request opens exactly one popover.
import { useEffect, useRef } from "react";
import type { NotificationLaneFilter } from "./classification.js";

export type InboxLane = Exclude<NotificationLaneFilter, "all">;

export interface InboxOpenRequest {
  /** Narrow the list to one actor (an agent's id). */
  actor?: { id: string; label: string };
  lane: InboxLane;
}

const listeners = new Set<(request: InboxOpenRequest) => void>();

export function openNotificationInbox(request: InboxOpenRequest): void {
  for (const listener of listeners) {
    listener(request);
  }
}

/** The bell's side: called with every `openNotificationInbox` request. */
export function useInboxOpenRequests(
  onRequest: (request: InboxOpenRequest) => void
): void {
  const latest = useRef(onRequest);
  latest.current = onRequest;
  useEffect(() => {
    const listener = (request: InboxOpenRequest) => latest.current(request);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
