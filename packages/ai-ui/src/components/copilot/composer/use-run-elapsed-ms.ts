"use client";

import { useEffect, useRef, useState } from "react";

/** How often the running clock repaints. One second — it is displayed in seconds. */
const TICK_MS = 1000;

/**
 * Milliseconds since the current run started, or null when nothing is running.
 *
 * Client-side on purpose: the server's `duration_ms` only exists once a run has
 * FINISHED, so during the turn there is no number to show — which is exactly
 * when the user most wants one. The clock resets on each activation, so a
 * second turn does not continue the first one's count.
 */
export function useRunElapsedMs(active: boolean): number | null {
  const startedAtRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setElapsedMs(null);
      return;
    }
    const startedAt = Date.now();
    startedAtRef.current = startedAt;
    // Paint 0s immediately rather than waiting a full tick for the first frame.
    setElapsedMs(0);
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [active]);

  return elapsedMs;
}
