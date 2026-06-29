/**
 * Extensibility contract for the selection bubble (formatting + links).
 */

import type { Editor } from "@tiptap/core";

/** One row from a link search backend (article, FAQ, external URL target, …). */
export interface LinkSearchHit {
  /** Stored on the link mark (`href`). Use app-relative paths or full URLs. */
  href: string;
  id: string;
  subtitle?: string;
  title: string;
}

/**
 * Pluggable link search backend. Host apps register one per scope
 * (e.g. “this KB”, “all KBs”, “CRM records”).
 */
export interface LinkSearchSource {
  id: string;
  label: string;
  search: (query: string, signal: AbortSignal) => Promise<LinkSearchHit[]>;
}

/** Extra toolbar actions (marks, custom nodes, …). */
export interface InlineBubbleMenuCustomItem {
  id: string;
  isActive?: (editor: Editor) => boolean;
  isDisabled?: (editor: Editor) => boolean;
  onClick: (editor: Editor) => void;
  title: string;
}

export interface InlineBubbleMenuLabels {
  applyUrl?: string;
  bold?: string;
  code?: string;
  italic?: string;
  link?: string;
  noResults?: string;
  searchPlaceholder?: string;
  strike?: string;
  underline?: string;
  unlink?: string;
  urlPlaceholder?: string;
}

export interface InlineBubbleMenuOptions {
  /** Additional buttons rendered after built-in marks. */
  customItems?: InlineBubbleMenuCustomItem[];
  /** When false, the bubble is not mounted. Default true when passed from editors. */
  enabled?: boolean;
  /** Override default English `title` tooltips / placeholders. */
  labels?: InlineBubbleMenuLabels;
  /** Debounced search for link targets; merged in the link panel. */
  linkSources?: LinkSearchSource[];
}
