import type { ObjectRef } from "@engenty/ai-core/browser";

/** Width of the floating context card (sticky, top-right of chat). */
export const THREAD_CONTEXT_FLOAT_WIDTH_PX = 240;

/** Gutter between chat content and the floating context card (and page edge). */
export const THREAD_CONTEXT_FLOAT_GAP_PX = 12;

/**
 * Lane the floating card reserves on the right of the chat: card width plus
 * the gutter on each side. Chat content pads by it; so does any chrome that
 * has to line up with the chat but sits outside the pane that publishes
 * {@link THREAD_CONTEXT_INLINE_PAD_VAR}.
 */
export const THREAD_CONTEXT_FLOAT_RESERVE_PX =
  THREAD_CONTEXT_FLOAT_WIDTH_PX + THREAD_CONTEXT_FLOAT_GAP_PX * 2;

/**
 * CSS custom property set on the chat surface when the floating card is
 * inline. Applied to scroll *content* and the composer (not the ScrollArea
 * shell) so the scrollbar stays on the far right of the main surface.
 */
export const THREAD_CONTEXT_INLINE_PAD_VAR = "--thread-context-inline-pad";

/**
 * CSS custom property a surface sets when something of its own already covers
 * the top of the chat — the desk's collapsed identity band. The floating card
 * clears the larger of this and the topbar.
 */
export const THREAD_CONTEXT_TOP_CLEARANCE_VAR =
  "--thread-context-top-clearance";

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

export interface ThreadContextAttachmentItem {
  filename: string;
  mimeType: string;
  storageKey: string;
  url?: string;
}

export interface ThreadContextAgentItem {
  agentId: string;
  agentName: string;
  href?: string | null;
  toolCallId: string;
}

export interface ThreadContextSummary {
  agents: ThreadContextAgentItem[];
  artefacts: ThreadContextArtifactItem[];
  attachments: ThreadContextAttachmentItem[];
  isEmpty: boolean;
  objects: ThreadContextObjectItem[];
  sources: ThreadContextSourceItem[];
}

/** Minimal message shape for transcript scanning (avoids coupling to panel props). */
export interface ThreadContextMessageLike {
  parts?: readonly unknown[] | null;
  role?: string;
}
