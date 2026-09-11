"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` after `timeoutMs` of continuous `status === "submitted" |
 * "streaming"` with no stream activity received.
 *
 * This acts as a last-resort guard: when the backend drops the stream
 * silently (e.g. task-dispatcher not running, AI service down) the user
 * would see their message hanging forever with no feedback. Once the
 * timeout fires, a visible error card is shown inline in the transcript.
 *
 * The timeout window restarts whenever:
 * - `activityKey` changes (ANY stream event arrived — reasoning and tool
 *   deltas count: a run can think for minutes without a new assistant
 *   message, and erroring a live run is exactly what this guard must not do)
 * - The `lastAssistantMessageId` changes (a real token arrived)
 * - The `threadId` changes (new conversation)
 *
 * The guard resets fully when `status` returns to `"ready"` or `"error"`.
 */
export function useChatNoResponseGuard({
  activityKey,
  lastAssistantMessageId,
  status,
  threadId,
  timeoutMs = 30_000,
}: {
  /** Monotonic stream-activity marker (e.g. received event count); any change
   *  proves the stream is alive and restarts the window. */
  activityKey?: number | string | null;
  /** The `id` of the most recent assistant message; change = response arrived. */
  lastAssistantMessageId: string | null | undefined;
  status: "ready" | "submitted" | "streaming" | "error" | string;
  threadId: string | null | undefined;
  /** How long to wait before surfacing an error. Default 30 s. */
  timeoutMs?: number;
}): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const active = status === "submitted" || status === "streaming";
    // Every dep change is evidence of life (activity, a token, a new thread)
    // or an end state — either way the previous verdict no longer holds.
    clearTimer();
    setTimedOut(false);
    if (!active) {
      return;
    }
    timerRef.current = setTimeout(() => {
      setTimedOut(true);
      timerRef.current = null;
    }, timeoutMs);
    return clearTimer;
  }, [activityKey, lastAssistantMessageId, status, threadId, timeoutMs]);

  return timedOut;
}
