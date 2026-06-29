"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up whole seconds while `active` is true, restarting from 0 each time
 * `active` flips back on. Returns 0 while inactive.
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startRef.current = null;
      setSeconds(0);
      return;
    }
    startRef.current = Date.now();
    setSeconds(0);
    const id = setInterval(() => {
      if (startRef.current != null) {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}
