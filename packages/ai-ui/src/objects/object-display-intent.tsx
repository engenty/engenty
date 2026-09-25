"use client";

import type {
  A2uiRenderMeta,
  ObjectDisplayHint,
  ObjectRef,
} from "@engenty/ai-core/browser";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/**
 * Seam between inline object cards and the surrounding chat surface. What a
 * card should do when you click a record depends entirely on where the chat
 * is:
 *
 * - **Full-page chat** provides all three. It owns a pane, so the primary
 *   action promotes the record into the side panel and you stay in the
 *   conversation; when a link really does leave for a module route, the chat
 *   hands itself off to the drawer first so it survives the jump.
 * - **Drawer / floating chat** provides nothing. The page behind it *is* the
 *   workspace, so links navigate normally and cards drop the pane
 *   affordances — there is no pane to promote into.
 *
 * Defaulting to `{}` is what makes the drawer correct without knowing about
 * it: absent handler = plain navigation.
 */

export interface ObjectDisplayIntent {
  /**
   * Execute an agent display hint for freshly-streamed tool output. Hosts
   * only honor this during a live run (never on transcript replay).
   */
  applyDisplayHint?: (
    refs: ObjectRef[],
    hint: ObjectDisplayHint,
    opts?: { title?: string }
  ) => void;
  /**
   * Prefill the chat composer from a panel/widget affordance ("Ask the agent
   * to…", quote a selection). Absent when the surface has no composer of its
   * own.
   */
  askAgent?: (prompt: string, ref?: ObjectRef) => void;
  /**
   * Leave chat for a module route. Full-page chat docks itself into the
   * drawer first; absent when the surface is already alongside the workspace.
   */
  navigateFromChat?: (href: string) => void;
  /** Open a ref as a pane tab. Absent when the surface has no pane. */
  openInPanel?: (
    ref: ObjectRef,
    opts?: { expanded?: boolean; title?: string }
  ) => void;
  /**
   * Publish an A2UI spec to the workspace end-pane (live canvas). Absent when
   * the surface has no pane — the chat card still shows the frozen snapshot.
   */
  openLiveSurface?: (meta: A2uiRenderMeta) => void;
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
    [
      value.openInPanel,
      value.applyDisplayHint,
      value.askAgent,
      value.navigateFromChat,
      value.openLiveSurface,
    ]
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
