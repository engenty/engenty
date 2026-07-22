import {
  buildDefaultDomEntryPoints,
  mergeDomEntryPoints,
} from "./agent-ui-dom-regions.js";
import type { JsonValue } from "./json-value.js";

/** Reserved `snapshot.page` keys surfaced in the copilot harness "Current page" section. */
export const AGENT_UI_PAGE_BRIEF_KEYS = [
  "page_type",
  "page_title",
  "page_description",
  "list_search",
  "list_filters",
  "list_total",
  "list_preview",
  "dom_entry_points",
] as const;

export type AgentUiPageBriefKey = (typeof AGENT_UI_PAGE_BRIEF_KEYS)[number];

export type AgentUiPageType =
  | "list"
  | "detail"
  | "settings"
  | "briefing"
  | (string & {});

export interface AgentUiPageBriefInput {
  /**
   * Optional overrides / extensions for DOM region selectors.
   * Defaults (app_bar, sidebar, topbar, main, and list/detail by page_type)
   * are always merged in so agents can scope `browser_dom_snapshot`.
   */
  dom_entry_points?: Partial<Record<string, string>>;
  list_filters?: Record<string, JsonValue>;
  list_preview?: JsonValue[];
  list_search?: string;
  list_total?: number;
  page_description?: string;
  page_title?: string;
  page_type?: AgentUiPageType;
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Builds a compact `page` partial for Agent UI slices.
 * Modules merge the result with module-specific keys (`task_snapshot`, …).
 * Always includes `dom_entry_points` (shell + page-type defaults, mergeable).
 */
export function buildAgentUiPageBrief(
  input: AgentUiPageBriefInput
): Partial<Record<AgentUiPageBriefKey, JsonValue>> {
  const out: Partial<Record<AgentUiPageBriefKey, JsonValue>> = {};

  const pageType = readNonEmptyString(input.page_type);
  if (pageType) {
    out.page_type = pageType;
  }

  const pageTitle = readNonEmptyString(input.page_title);
  if (pageTitle) {
    out.page_title = pageTitle;
  }

  const pageDescription = readNonEmptyString(input.page_description);
  if (pageDescription) {
    out.page_description = pageDescription;
  }

  const listSearch = readNonEmptyString(input.list_search);
  if (listSearch) {
    out.list_search = listSearch;
  }

  if (
    input.list_filters &&
    typeof input.list_filters === "object" &&
    !Array.isArray(input.list_filters) &&
    Object.keys(input.list_filters).length > 0
  ) {
    out.list_filters = input.list_filters;
  }

  if (
    typeof input.list_total === "number" &&
    Number.isFinite(input.list_total)
  ) {
    out.list_total = input.list_total;
  }

  if (Array.isArray(input.list_preview) && input.list_preview.length > 0) {
    out.list_preview = input.list_preview;
  }

  out.dom_entry_points = mergeDomEntryPoints(
    buildDefaultDomEntryPoints(pageType),
    input.dom_entry_points
  );

  return out;
}

export function isAgentUiPageBriefKey(key: string): key is AgentUiPageBriefKey {
  return (AGENT_UI_PAGE_BRIEF_KEYS as readonly string[]).includes(key);
}
