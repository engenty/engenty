"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` after `timeoutMs` of continuous `status === "submitted" |
 * "streaming"` with no new assistant message content received.
 *
 * This acts as a last-resort guard: when the backend drops the stream
 * silently (e.g. task-dispatcher not running, AI service down) the user
 * would see their message hanging forever with no feedback. Once the
 * timeout fires, a visible error card is shown inline in the transcript.
 *
 * The guard resets when:
 * - `status` returns to `"ready"` or `"error"`
 * - The `lastAssistantMessageId` changes (a real token arrived)
 * - The `threadId` changes (new conversation)
 */
export function useChatNoResponseGuard({
  lastAssistantMessageId,
  status,
  threadId,
  timeoutMs = 30_000,
}: {
  /** The `id` of the most recent assistant message; change = response arrived. */
  lastAssistantMessageId: string | null | undefined;
  status: "ready" | "submitted" | "streaming" | "error" | string;
  threadId: string | null | undefined;
  /** How long to wait before surfacing an error. Default 30 s. */
  timeoutMs?: number;
}): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any running timer.
  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const active = status === "submitted" || status === "streaming";

    if (!active) {
      clearTimer();
      setTimedOut(false);
      return;
    }

    // Already timed out — do not restart.
    if (timedOut) {
      return;
    }

    // Start the timer when we enter an active state.
    if (timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        setTimedOut(true);
        timerRef.current = null;
      }, timeoutMs);
    }

    return clearTimer;
  }, [status, timedOut, timeoutMs]);

  // Reset when a real assistant response arrives or thread changes.
  useEffect(() => {
    clearTimer();
    setTimedOut(false);
  }, [lastAssistantMessageId, threadId]);

  return timedOut;
}
