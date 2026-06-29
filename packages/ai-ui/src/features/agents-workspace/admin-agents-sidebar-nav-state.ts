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

/** Core Engenty Copilot — shown under Pinned by default until the user changes pins. */
export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";

export const DEFAULT_PINNED_AGENT_IDS: string[] = [ENGENTY_COPILOT_AGENT_ID];

export interface AdminAgentsSidebarNavStateV1 {
  asideWidthPx: number;
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

export const DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE: AdminAgentsSidebarNavStateV1 =
  {
    asideWidthPx: ADMIN_AGENTS_ASIDE_WIDTH_DEFAULT_PX,
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
