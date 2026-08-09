import type { ObjectRef } from "@engenty/ai-core/browser";

/** Width of the floating context card (sticky, top-right of chat). */
export const THREAD_CONTEXT_FLOAT_WIDTH_PX = 240;

/** Gutter between chat content and the floating context card (and page edge). */
export const THREAD_CONTEXT_FLOAT_GAP_PX = 12;

/**
 * CSS custom property set on the chat surface when the floating card is
 * inline. Applied to scroll *content* and the composer (not the ScrollArea
 * shell) so the scrollbar stays on the far right of the main surface.
 */
export const THREAD_CONTEXT_INLINE_PAD_VAR = "--thread-context-inline-pad";

/** @deprecated Use {@link THREAD_CONTEXT_FLOAT_WIDTH_PX}. */
export const THREAD_CONTEXT_PANE_WIDTH_PX = THREAD_CONTEXT_FLOAT_WIDTH_PX;

/**
 * Content-stack width below which the floating card collapses behind the
 * topbar icon (same threshold as DocSidebar inline).
 */
export const THREAD_CONTEXT_INLINE_MIN_WIDTH_PX = 800;

export type ThreadContextMode = "hidden" | "inline" | "collapsed";

export interface ThreadContextArtifactItem {
  id: string;
  title: string;
  type: string;
}

export interface ThreadContextObjectItem {
  href?: string | null;
  ref: ObjectRef;
  title: string;
}

export interface ThreadContextSourceItem {
  title: string;
  url: string;
}

export interface ThreadContextSummary {
  artefacts: ThreadContextArtifactItem[];
  isEmpty: boolean;
  objects: ThreadContextObjectItem[];
  sources: ThreadContextSourceItem[];
}

/** Minimal message shape for transcript scanning (avoids coupling to panel props). */
export interface ThreadContextMessageLike {
  parts?: readonly unknown[] | null;
  role?: string;
}
