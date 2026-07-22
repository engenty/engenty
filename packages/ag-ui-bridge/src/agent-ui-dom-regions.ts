/**
 * Stable shell / page DOM regions for agent browser tools.
 * Prefer these as `browser_dom_snapshot` `root_selector` values over `document.body`.
 */

/** Values for `data-engenty-region` on shell chrome and page content roots. */
export const AGENT_UI_DOM_REGION = {
  appBar: "app-bar",
  sidebar: "sidebar",
  topbar: "topbar",
  main: "main",
  list: "list",
  detail: "detail",
} as const;

export type AgentUiDomRegionId =
  (typeof AGENT_UI_DOM_REGION)[keyof typeof AGENT_UI_DOM_REGION];

/** CSS selectors for each region (match `data-engenty-region`). */
export const AGENT_UI_DOM_REGION_SELECTORS: Record<AgentUiDomRegionId, string> =
  {
    "app-bar": `[data-engenty-region="${AGENT_UI_DOM_REGION.appBar}"]`,
    sidebar: `[data-engenty-region="${AGENT_UI_DOM_REGION.sidebar}"]`,
    topbar: `[data-engenty-region="${AGENT_UI_DOM_REGION.topbar}"]`,
    main: `[data-engenty-region="${AGENT_UI_DOM_REGION.main}"]`,
    list: `[data-engenty-region="${AGENT_UI_DOM_REGION.list}"]`,
    detail: `[data-engenty-region="${AGENT_UI_DOM_REGION.detail}"]`,
  };

/** Page-brief key → selector map (snake_case keys for harness readability). */
export interface AgentUiDomEntryPoints {
  app_bar: string;
  detail?: string;
  list?: string;
  main: string;
  sidebar: string;
  topbar: string;
}

/**
 * Default DOM entry points for the current page type.
 * Shell always registers app_bar / sidebar / topbar / main.
 * `list` / `detail` are included when relevant — modules should mark those
 * roots with `data-engenty-region`; if missing, fall back to `main`.
 */
export function buildDefaultDomEntryPoints(
  pageType?: string
): AgentUiDomEntryPoints {
  const base: AgentUiDomEntryPoints = {
    app_bar: AGENT_UI_DOM_REGION_SELECTORS["app-bar"],
    sidebar: AGENT_UI_DOM_REGION_SELECTORS.sidebar,
    topbar: AGENT_UI_DOM_REGION_SELECTORS.topbar,
    main: AGENT_UI_DOM_REGION_SELECTORS.main,
  };

  if (pageType === "list") {
    return { ...base, list: AGENT_UI_DOM_REGION_SELECTORS.list };
  }
  if (pageType === "detail") {
    return { ...base, detail: AGENT_UI_DOM_REGION_SELECTORS.detail };
  }
  return base;
}

export function mergeDomEntryPoints(
  defaults: AgentUiDomEntryPoints,
  overrides?: Partial<Record<string, string>> | null
): AgentUiDomEntryPoints {
  if (!overrides || typeof overrides !== "object") {
    return defaults;
  }
  const out: AgentUiDomEntryPoints = { ...defaults };
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    (out as unknown as Record<string, string>)[key] = trimmed;
  }
  return out;
}
