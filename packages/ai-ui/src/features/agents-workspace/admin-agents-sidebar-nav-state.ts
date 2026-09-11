import type {
  SkillCatalogGroupBy,
  SkillCatalogOriginFilter,
  SkillCatalogSortBy,
  SkillCatalogTierFilter,
} from "./skills-catalog-state";

/** `core.user_settings.name` for Engenty admin → Agents sidebar UI state (JSON). */
export const ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME =
  "admin_agents_sidebar_nav_state";

/** Desktop agents workspace catalog rail (px). */
export const ADMIN_AGENTS_ASIDE_WIDTH_MIN_PX = 200;
export const ADMIN_AGENTS_ASIDE_WIDTH_MAX_PX = 440;
export const ADMIN_AGENTS_ASIDE_WIDTH_DEFAULT_PX = 248;

export function clampAdminAgentsAsideWidthPx(px: number): number {
  return Math.max(
    ADMIN_AGENTS_ASIDE_WIDTH_MIN_PX,
    Math.min(ADMIN_AGENTS_ASIDE_WIDTH_MAX_PX, Math.round(px))
  );
}

function readAsideWidthPx(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return ADMIN_AGENTS_ASIDE_WIDTH_DEFAULT_PX;
  }
  return clampAdminAgentsAsideWidthPx(raw);
}

export interface WorkspaceNavSectionsState {
  actionsOpen: boolean;
  agentsOpen: boolean;
  skillsOpen: boolean;
}

export interface WorkspaceNavModuleFoldersState {
  actions: Record<string, boolean>;
  skills: Record<string, boolean>;
}

export type CatalogSortOrder = "asc" | "desc";
export type AgentKindFilter = "all" | "system" | "agent";
export type FlowGroupBy = "none" | "module" | "source";
export type FlowOriginFilter = "all" | "module" | "authored";

/**
 * How each catalog tab is grouped, filtered and sorted.
 *
 * The search box is deliberately NOT here: a query restored on the next visit
 * hides most of the catalog with nothing on screen saying why. Group / filter /
 * sort are visible in the chrome, so a restored one explains itself.
 */
export interface WorkspaceNavCatalogFiltersState {
  agents: { kind: AgentKindFilter; sortOrder: CatalogSortOrder };
  flows: {
    groupBy: FlowGroupBy;
    source: FlowOriginFilter;
    sortOrder: CatalogSortOrder;
  };
  skills: {
    groupBy: SkillCatalogGroupBy;
    /** Module id, or "all". Free-form because the module list is per tenant. */
    module: string;
    origin: SkillCatalogOriginFilter;
    sortBy: SkillCatalogSortBy;
    sortOrder: CatalogSortOrder;
    tier: SkillCatalogTierFilter;
  };
}

/** Which catalog tab a filter patch belongs to. */
export type CatalogFiltersTab = keyof WorkspaceNavCatalogFiltersState;

/** Core Engenty Copilot — shown under Pinned by default until the user changes pins. */
export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";

export const DEFAULT_PINNED_AGENT_IDS: string[] = [ENGENTY_COPILOT_AGENT_ID];

export interface AdminAgentsSidebarNavStateV1 {
  asideWidthPx: number;
  catalogFilters: WorkspaceNavCatalogFiltersState;
  moduleFolders: WorkspaceNavModuleFoldersState;
  /** Agent definition ids, top-first order. Omitted in legacy saves → defaults applied in merge. */
  pinnedAgents: string[];
  /** Orchestrator session ids for the dashboard rail; shown first in Recent sessions. */
  pinnedSessions: string[];
  sections: WorkspaceNavSectionsState;
  v: 1;
}

const DEFAULT_SECTIONS: WorkspaceNavSectionsState = {
  actionsOpen: false,
  agentsOpen: false,
  skillsOpen: false,
};

const DEFAULT_MODULE_FOLDERS: WorkspaceNavModuleFoldersState = {
  actions: {},
  skills: {},
};

export const DEFAULT_CATALOG_FILTERS: WorkspaceNavCatalogFiltersState = {
  agents: { kind: "all", sortOrder: "asc" },
  flows: { groupBy: "none", source: "all", sortOrder: "asc" },
  skills: {
    groupBy: "module",
    module: "all",
    origin: "all",
    sortBy: "name",
    sortOrder: "asc",
    tier: "all",
  },
};

export const DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE: AdminAgentsSidebarNavStateV1 =
  {
    asideWidthPx: ADMIN_AGENTS_ASIDE_WIDTH_DEFAULT_PX,
    catalogFilters: DEFAULT_CATALOG_FILTERS,
    moduleFolders: DEFAULT_MODULE_FOLDERS,
    pinnedAgents: [...DEFAULT_PINNED_AGENT_IDS],
    pinnedSessions: [],
    sections: DEFAULT_SECTIONS,
    v: 1,
  };

function readPinnedSessionsArray(raw: Record<string, unknown>): string[] {
  if (!("pinnedSessions" in raw)) {
    return [];
  }
  const value = raw.pinnedSessions;
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function readPinnedAgentsArray(raw: Record<string, unknown>): string[] {
  if (!("pinnedAgents" in raw)) {
    return [...DEFAULT_PINNED_AGENT_IDS];
  }
  const value = raw.pinnedAgents;
  if (!Array.isArray(value)) {
    return [...DEFAULT_PINNED_AGENT_IDS];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === "string" && item.trim().length > 0 && !seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** A stored enum value, or the default when it is not one this build knows. */
function readOneOf<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function readCatalogFilters(raw: unknown): WorkspaceNavCatalogFiltersState {
  const source = (raw ?? {}) as Record<string, Record<string, unknown>>;
  const agents = source.agents ?? {};
  const flows = source.flows ?? {};
  const skills = source.skills ?? {};
  const defaults = DEFAULT_CATALOG_FILTERS;
  return {
    agents: {
      kind: readOneOf(
        agents.kind,
        ["all", "system", "agent"],
        defaults.agents.kind
      ),
      sortOrder: readOneOf(
        agents.sortOrder,
        ["asc", "desc"],
        defaults.agents.sortOrder
      ),
    },
    flows: {
      groupBy: readOneOf(
        flows.groupBy,
        ["none", "module", "source"],
        defaults.flows.groupBy
      ),
      source: readOneOf(
        flows.source,
        ["all", "module", "authored"],
        defaults.flows.source
      ),
      sortOrder: readOneOf(
        flows.sortOrder,
        ["asc", "desc"],
        defaults.flows.sortOrder
      ),
    },
    skills: {
      groupBy: readOneOf(
        skills.groupBy,
        ["module", "source", "tier", "none"],
        defaults.skills.groupBy
      ),
      // A module that has since been unmounted would filter the list down to
      // nothing, so an unknown id falls back to "all" at read time instead.
      module:
        typeof skills.module === "string" && skills.module.trim()
          ? skills.module
          : defaults.skills.module,
      origin: readOneOf(
        skills.origin,
        ["all", "core", "module", "tenant"],
        defaults.skills.origin
      ),
      sortBy: readOneOf(
        skills.sortBy,
        ["name", "module", "updated_at"],
        defaults.skills.sortBy
      ),
      sortOrder: readOneOf(
        skills.sortOrder,
        ["asc", "desc"],
        defaults.skills.sortOrder
      ),
      tier: readOneOf(
        skills.tier,
        ["all", "managed", "custom"],
        defaults.skills.tier
      ),
    },
  };
}

function readBooleanRecord(raw: unknown): Record<string, boolean> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "boolean") {
        out[key] = value;
      }
    }
    return out;
  }
  return {};
}

export function mergeAdminAgentsSidebarNavDefaults(
  raw: Record<string, unknown> | null | undefined
): AdminAgentsSidebarNavStateV1 {
  const sectionsRaw = raw?.sections as
    | Partial<WorkspaceNavSectionsState>
    | undefined;
  const foldersRaw = raw?.moduleFolders as
    | Partial<WorkspaceNavModuleFoldersState>
    | undefined;
  return {
    asideWidthPx: readAsideWidthPx(raw?.asideWidthPx),
    catalogFilters: readCatalogFilters(raw?.catalogFilters),
    moduleFolders: {
      actions: readBooleanRecord(foldersRaw?.actions),
      skills: readBooleanRecord(foldersRaw?.skills),
    },
    pinnedAgents: readPinnedAgentsArray(raw ?? {}),
    pinnedSessions: readPinnedSessionsArray(raw ?? {}),
    sections: {
      actionsOpen:
        typeof sectionsRaw?.actionsOpen === "boolean"
          ? sectionsRaw.actionsOpen
          : DEFAULT_SECTIONS.actionsOpen,
      agentsOpen:
        typeof sectionsRaw?.agentsOpen === "boolean"
          ? sectionsRaw.agentsOpen
          : DEFAULT_SECTIONS.agentsOpen,
      skillsOpen:
        typeof sectionsRaw?.skillsOpen === "boolean"
          ? sectionsRaw.skillsOpen
          : DEFAULT_SECTIONS.skillsOpen,
    },
    v: 1,
  };
}

export function parseAdminAgentsSidebarNavFromUnknown(
  raw: unknown
): AdminAgentsSidebarNavStateV1 {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE };
  }
  return mergeAdminAgentsSidebarNavDefaults(raw as Record<string, unknown>);
}
