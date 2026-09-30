"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up whole seconds while `active` is true — from `since` when given
 * (a clock shared with another display), else from the moment `active` flips
 * on. Returns 0 while inactive.
 */
export function useElapsedSeconds(
  active: boolean,
  since?: number | null
): number {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setSeconds(0);
      return;
    }
    const start = since ?? Date.now();
    startRef.current = start;
    setSeconds(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const id = setInterval(() => {
      if (startRef.current != null) {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, since]);

  return seconds;
}
