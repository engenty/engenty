"use client";

import type { ObjectDisplayHint, ObjectRef } from "@engenty/ai-core/browser";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Seam between inline object cards and the surrounding surface's pane: the
 * workspace pane host provides handlers so cards can promote an object into
 * the side panel (or expanded mode); surfaces without a pane simply provide
 * nothing and cards omit the affordance.
 */

export interface ObjectDisplayIntent {
  /**
   * Execute an agent display hint for freshly-streamed tool output. Hosts
   * only honor this during a live run (never on transcript replay).
   */
  applyDisplayHint?: (refs: ObjectRef[], hint: ObjectDisplayHint) => void;
  /** Open a ref as a pane tab. Absent when the surface has no pane. */
  openInPanel?: (ref: ObjectRef, opts?: { expanded?: boolean }) => void;
}

const ObjectDisplayIntentContext = createContext<ObjectDisplayIntent>({});

export function ObjectDisplayIntentProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ObjectDisplayIntent;
}) {
  const memoized = useMemo(
    () => value,
    [value.openInPanel, value.applyDisplayHint]
  );
  return (
    <ObjectDisplayIntentContext.Provider value={memoized}>
      {children}
    </ObjectDisplayIntentContext.Provider>
  );
}

export function useObjectDisplayIntent(): ObjectDisplayIntent {
  return useContext(ObjectDisplayIntentContext);
}
