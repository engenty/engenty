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
import {
  flowEntryStatus,
  type WorkflowCatalogEntry,
} from "../workflow-canvas/workflow-flows-state";

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

export interface FlowCounts {
  declared: number;
  draft: number;
  live: number;
  /** live + declared — everything that can run now. What the card shows. */
  ready: number;
  total: number;
}

/**
 * Live vs draft, because that is the governance question a flow raises: how
 * many of these can actually run. Disabled flows count in the total but are
 * neither, which is the honest reading — they exist and they do not run.
 * `declared` is the third state the merged catalog added: a module workflow nobody
 * has pressed yet, so it has no compiled version to be live or draft.
 */
export function countFlows(flows: readonly WorkflowCatalogEntry[]): FlowCounts {
  let live = 0;
  let draft = 0;
  let declared = 0;
  for (const flow of flows) {
    const status = flowEntryStatus(flow);
    if (status === "active") {
      live += 1;
    } else if (status === "draft") {
      draft += 1;
    } else if (status === "declared") {
      declared += 1;
    }
  }
  // What a person actually needs: can it run right now, or not? "Declared"
  // (a module action with no compiled graph yet) and "active" (already
  // compiled and published) are the SAME answer — yes — and the difference
  // between them is compile-on-use plumbing, not a state anyone manages.
  return {
    declared,
    draft,
    live,
    ready: live + declared,
    total: flows.length,
  };
}

interface ArtifactLike {
  created_by_kind: "agent" | "user";
}

export interface ArtifactCounts {
  agent: number;
  total: number;
  user: number;
}

export function countArtifacts(
  artifacts: readonly ArtifactLike[]
): ArtifactCounts {
  const agent = artifacts.filter(
    (artifact) => artifact.created_by_kind === "agent"
  ).length;
  return { agent, total: artifacts.length, user: artifacts.length - agent };
}

/** First N display names for a capability card preview line. */
export function previewNames(
  items: readonly { name: string }[],
  limit = 3
): string[] {
  return items.slice(0, limit).map((item) => item.name);
}
