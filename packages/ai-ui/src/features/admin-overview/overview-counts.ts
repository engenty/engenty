// Pure count helpers for the Overview dashboard (ui-6 §1).

import type {
  AiAgentRole,
  AiAgentSource,
} from "../../lib/admin/ai-runtime-types";
import {
  type AgentCatalogGroup,
  getAgentCatalogGroup,
} from "../agents-catalog/agents-catalog-state";
import {
  deriveToolSourceCategory,
  type RegistryToolEntry,
  type ToolSourceCategory,
} from "../tools-catalog/tools-catalog-state";

interface AgentLike {
  id: string;
  managed_by_module?: string | null;
  name: string;
  role?: AiAgentRole;
  source?: AiAgentSource;
}

export type WorkforceCounts = Record<AgentCatalogGroup, number>;

export function countWorkforce(agents: readonly AgentLike[]): WorkforceCounts {
  const counts: WorkforceCounts = {
    chat_surfaces: 0,
    custom: 0,
    external: 0,
    leadership: 0,
    specialists: 0,
  };
  for (const agent of agents) {
    counts[getAgentCatalogGroup(agent as never)] += 1;
  }
  return counts;
}

interface SkillLike {
  name: string;
  tier?: "managed" | "custom";
}

export interface SkillCounts {
  custom: number;
  managed: number;
  total: number;
}

export function countSkills(skills: readonly SkillLike[]): SkillCounts {
  const custom = skills.filter((skill) => skill.tier === "custom").length;
  return { custom, managed: skills.length - custom, total: skills.length };
}

export type ToolCounts = Record<ToolSourceCategory, number> & {
  total: number;
};

export function countTools(tools: readonly RegistryToolEntry[]): ToolCounts {
  const counts: ToolCounts = { custom: 0, mcp: 0, module: 0, total: 0 };
  for (const tool of tools) {
    counts[deriveToolSourceCategory(tool)] += 1;
    counts.total += 1;
  }
  return counts;
}

interface ActionLike {
  name: string;
  owner_kind?: "core" | "module" | "tenant";
}

export interface ActionCounts {
  custom: number;
  shipped: number;
  total: number;
}

export function countActions(actions: readonly ActionLike[]): ActionCounts {
  const custom = actions.filter(
    (action) => action.owner_kind === "tenant"
  ).length;
  return { custom, shipped: actions.length - custom, total: actions.length };
}

/** First N display names for a capability card preview line. */
export function previewNames(
  items: readonly { name: string }[],
  limit = 3
): string[] {
  return items.slice(0, limit).map((item) => item.name);
}
