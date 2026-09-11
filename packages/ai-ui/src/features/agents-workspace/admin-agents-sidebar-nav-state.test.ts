import { describe, expect, it } from "vitest";
import {
  ADMIN_AGENTS_ASIDE_WIDTH_MAX_PX,
  ADMIN_AGENTS_ASIDE_WIDTH_MIN_PX,
  ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME,
  DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE,
  DEFAULT_CATALOG_FILTERS,
  ENGENTY_COPILOT_AGENT_ID,
  mergeAdminAgentsSidebarNavDefaults,
  parseAdminAgentsSidebarNavFromUnknown,
} from "./admin-agents-sidebar-nav-state";

describe("admin agents sidebar nav state", () => {
  it("exposes stable user_settings name", () => {
    expect(ADMIN_AGENTS_SIDEBAR_NAV_USER_SETTING_NAME).toBe(
      "admin_agents_sidebar_nav_state"
    );
  });

  it("mergeAdminAgentsSidebarNavDefaults fills missing fields", () => {
    expect(mergeAdminAgentsSidebarNavDefaults({})).toEqual(
      DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE
    );
    expect(
      mergeAdminAgentsSidebarNavDefaults({
        sections: { agentsOpen: false },
      })
    ).toEqual({
      asideWidthPx: DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE.asideWidthPx,
      catalogFilters: DEFAULT_CATALOG_FILTERS,
      moduleFolders: { actions: {}, skills: {} },
      pinnedAgents: [ENGENTY_COPILOT_AGENT_ID],
      pinnedSessions: [],
      sections: {
        actionsOpen: false,
        agentsOpen: false,
        skillsOpen: false,
      },
      v: 1,
    });
  });

  it("mergeAdminAgentsSidebarNavDefaults keeps explicit empty pinnedAgents", () => {
    expect(
      mergeAdminAgentsSidebarNavDefaults({ pinnedAgents: [] })
    ).toMatchObject({
      pinnedAgents: [],
    });
  });

  it("mergeAdminAgentsSidebarNavDefaults dedupes pinnedAgents", () => {
    expect(
      mergeAdminAgentsSidebarNavDefaults({
        pinnedAgents: ["a", "a", "b"],
      })
    ).toMatchObject({
      pinnedAgents: ["a", "b"],
    });
  });

  it("mergeAdminAgentsSidebarNavDefaults clamps asideWidthPx", () => {
    expect(
      mergeAdminAgentsSidebarNavDefaults({ asideWidthPx: 9000 })
    ).toMatchObject({
      asideWidthPx: ADMIN_AGENTS_ASIDE_WIDTH_MAX_PX,
    });
    expect(
      mergeAdminAgentsSidebarNavDefaults({ asideWidthPx: 10 })
    ).toMatchObject({
      asideWidthPx: ADMIN_AGENTS_ASIDE_WIDTH_MIN_PX,
    });
  });

  it("parseAdminAgentsSidebarNavFromUnknown rejects invalid payloads", () => {
    expect(parseAdminAgentsSidebarNavFromUnknown(null)).toEqual(
      DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE
    );
    expect(parseAdminAgentsSidebarNavFromUnknown([])).toEqual(
      DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE
    );
  });

  it("keeps known catalog filters and drops values this build cannot render", () => {
    const parsed = parseAdminAgentsSidebarNavFromUnknown({
      catalogFilters: {
        agents: { kind: "system", sortOrder: "desc" },
        flows: { groupBy: "module", source: "nonsense", sortOrder: "desc" },
        skills: { module: "contacts", tier: "custom" },
      },
      v: 1,
    });
    expect(parsed.catalogFilters.agents).toEqual({
      kind: "system",
      sortOrder: "desc",
    });
    // `source` is not one of this build's options, so it falls back rather than
    // filtering the catalog down to nothing the chrome can explain.
    expect(parsed.catalogFilters.flows).toEqual({
      groupBy: "module",
      source: "all",
      sortOrder: "desc",
    });
    expect(parsed.catalogFilters.skills).toEqual({
      ...DEFAULT_CATALOG_FILTERS.skills,
      module: "contacts",
      tier: "custom",
    });
  });

  it("parseAdminAgentsSidebarNavFromUnknown reads moduleFolders booleans", () => {
    expect(
      parseAdminAgentsSidebarNavFromUnknown({
        moduleFolders: {
          actions: { contacts: true },
          skills: {},
        },
        sections: {
          actionsOpen: true,
          agentsOpen: true,
          skillsOpen: false,
        },
        v: 1,
      })
    ).toEqual({
      asideWidthPx: DEFAULT_ADMIN_AGENTS_SIDEBAR_NAV_STATE.asideWidthPx,
      catalogFilters: DEFAULT_CATALOG_FILTERS,
      moduleFolders: { actions: { contacts: true }, skills: {} },
      pinnedAgents: [ENGENTY_COPILOT_AGENT_ID],
      pinnedSessions: [],
      sections: {
        actionsOpen: true,
        agentsOpen: true,
        skillsOpen: false,
      },
      v: 1,
    });
  });
});
