// Pure filtering/grouping helpers for the unified agents catalog (ui-6 §2).

import type {
  AiAgentRole,
  AiRegisteredAgent,
} from "../../lib/admin/ai-runtime-types";

export type AgentRoleFilter = "all" | AiAgentRole;
export type AgentSourceFilter = "all" | "builtin" | "module" | "custom";

/** Section order: Copilot & coordinator / Workers / Chat surfaces / External / Custom. */
export const AGENT_CATALOG_GROUPS = [
  "leadership",
  "specialists",
  "chat_surfaces",
  "external",
  "custom",
] as const;
export type AgentCatalogGroup = (typeof AGENT_CATALOG_GROUPS)[number];

/** Admin path of the chatbot module managing external agents. */
export const CHATBOT_ADMIN_PATH = "/mdl/chatbot/manage";

export function getAgentRole(agent: AiRegisteredAgent): AiAgentRole {
  return agent.role ?? "specialist";
}

export function isCustomAgent(agent: AiRegisteredAgent): boolean {
  return agent.source === "database" || agent.source === undefined;
}

/** Edit/Delete affordances: tenant-created rows only, never module-synced ones. */
export function isEditableAgent(agent: AiRegisteredAgent): boolean {
  return isCustomAgent(agent) && !agent.managed_by_module;
}

export function getAgentCatalogGroup(
  agent: AiRegisteredAgent
): AgentCatalogGroup {
  const role = getAgentRole(agent);
  if (role === "copilot" || role === "coordinator") {
    return "leadership";
  }
  if (role === "external") {
    return "external";
  }
  if (role === "chat_surface") {
    return "chat_surfaces";
  }
  return isCustomAgent(agent) ? "custom" : "specialists";
}

const ROLE_FILTER_VALUES: readonly AgentRoleFilter[] = [
  "all",
  "copilot",
  "coordinator",
  "specialist",
  "chat_surface",
  "external",
];
const SOURCE_FILTER_VALUES: readonly AgentSourceFilter[] = [
  "all",
  "builtin",
  "module",
  "custom",
];

/** Parse the `role` search param (overview workforce-card links) into a filter. */
export function parseAgentRoleFilter(value: string | null): AgentRoleFilter {
  return ROLE_FILTER_VALUES.includes(value as AgentRoleFilter)
    ? (value as AgentRoleFilter)
    : "all";
}

/** Parse the `source` search param into a filter. */
export function parseAgentSourceFilter(
  value: string | null
): AgentSourceFilter {
  return SOURCE_FILTER_VALUES.includes(value as AgentSourceFilter)
    ? (value as AgentSourceFilter)
    : "all";
}

export interface AgentCatalogFilterState {
  roleFilter: AgentRoleFilter;
  searchQuery: string;
  sourceFilter: AgentSourceFilter;
}

function matchesSource(
  agent: AiRegisteredAgent,
  filter: AgentSourceFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "custom") {
    return isCustomAgent(agent);
  }
  return agent.source === filter;
}

export function filterAgents(
  agents: AiRegisteredAgent[],
  state: AgentCatalogFilterState
): AiRegisteredAgent[] {
  const query = state.searchQuery.trim().toLowerCase();
  return agents.filter((agent) => {
    if (
      state.roleFilter !== "all" &&
      getAgentRole(agent) !== state.roleFilter
    ) {
      return false;
    }
    if (!matchesSource(agent, state.sourceFilter)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.id.toLowerCase().includes(query)
    );
  });
}

export function groupAgents(
  agents: AiRegisteredAgent[]
): { agents: AiRegisteredAgent[]; group: AgentCatalogGroup }[] {
  const byGroup = new Map<AgentCatalogGroup, AiRegisteredAgent[]>();
  for (const agent of agents) {
    const group = getAgentCatalogGroup(agent);
    byGroup.set(group, [...(byGroup.get(group) ?? []), agent]);
  }
  return AGENT_CATALOG_GROUPS.filter((group) => byGroup.has(group)).map(
    (group) => ({ agents: byGroup.get(group) ?? [], group })
  );
}

/** i18n keys for each catalog group label. */
export const AGENT_GROUP_LABEL_KEYS: Record<AgentCatalogGroup, string> = {
  chat_surfaces: "agentsCatalog.group.chatSurfaces",
  custom: "agentsCatalog.group.custom",
  external: "agentsCatalog.group.external",
  leadership: "agentsCatalog.group.leadership",
  specialists: "agentsCatalog.group.specialists",
};

export interface AgentCatalogGroupView {
  agents: AiRegisteredAgent[];
  id: AgentCatalogGroup;
  label: string;
}

/** Group agents and resolve display labels — shared by the table and card views. */
export function groupAgentsCatalog(
  agents: AiRegisteredAgent[],
  labelFor: (group: AgentCatalogGroup) => string
): AgentCatalogGroupView[] {
  return groupAgents(agents).map((entry) => ({
    agents: entry.agents,
    id: entry.group,
    label: labelFor(entry.group),
  }));
}
