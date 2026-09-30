"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * When the turn in flight started — one clock for every status that shows it
 * (the trailing "Thinking … 12s" line, the tool timeline's header), so the
 * count carries on when one hands the status to the other. Null at rest.
 */
export const TurnStartedAtContext = createContext<number | null>(null);

export function useTurnStartedAt(): number | null {
  return useContext(TurnStartedAtContext);
}

/** The moment `busy` last turned on; null while it is off. */
export function useTurnStart(busy: boolean): number | null {
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    busy ? Date.now() : null
  );
  useEffect(() => {
    setStartedAt((previous) => (busy ? (previous ?? Date.now()) : null));
  }, [busy]);
  return startedAt;
}
