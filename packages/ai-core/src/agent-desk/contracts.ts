import type { AgentEngentyKind } from "../agents/agent-engenty.js";
import type { ResolvedAgentStarter } from "../agents/agent-starters.js";

export type AgentDeskStarter = ResolvedAgentStarter;

export const AGENT_DESK_LANES = [
  "waiting",
  "active",
  "conversation",
  "assigned",
  "completed",
] as const;

export type AgentDeskLane = (typeof AGENT_DESK_LANES)[number];
export type AgentDeskEngagementKind = "conversation" | "proposal" | "task";

/** Display chip for a skill or connector on the specialist start header. */
export interface AgentDeskCapabilityChip {
  id: string;
  label: string;
}

export interface AgentDeskAgent {
  /**
   * Whose conversations these are. Absent reads as shared — the same rule
   * space chats use. Personal desks are 1:1 and do not show sender labels.
   */
  agentScope?: "personal" | "shared" | null;
  /** Generated portrait storage key or URL; blob silhouette when absent. */
  avatarUrl?: string | null;
  can_ask: boolean;
  can_assign_work: boolean;
  connectors: AgentDeskCapabilityChip[];
  description: string | null;
  /** Blob character for the start header (resolved preference or id hash). */
  engenty: AgentEngentyKind;
  id: string;
  managed_by_module: string | null;
  /** Model the agent runs on — the Manage tab shows it, as admin does. */
  model: string | null;
  name: string;
  role:
    | "chat_surface"
    | "coordinator"
    | "copilot"
    | "delegated"
    | "external"
    | "specialist";
  skills: AgentDeskCapabilityChip[];
  source: "builtin" | "database" | "module" | null;
  /** Locale-resolved empty-state chips (no locale map on the wire). */
  starters: AgentDeskStarter[];
}

/** Title-case hyphen/underscore/dot ids (`contacts-search` → `Contacts Search`). */
export function formatAgentDeskCapabilityLabel(id: string): string {
  return id
    .split(/[-_.]+/u)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function agentDeskCapabilityChips(
  ids: readonly string[] | undefined
): AgentDeskCapabilityChip[] {
  const seen = new Set<string>();
  const chips: AgentDeskCapabilityChip[] = [];
  for (const raw of ids ?? []) {
    const id = raw.trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    chips.push({ id, label: formatAgentDeskCapabilityLabel(id) });
  }
  return chips;
}

export interface AgentDeskEngagement {
  href: string;
  id: string;
  kind: AgentDeskEngagementKind;
  lane: AgentDeskLane;
  metadata: Record<string, unknown>;
  sort_at: string;
  status: string;
  subtitle: string | null;
  title: string;
}

export type AgentDeskLaneCounts = Record<AgentDeskLane, number>;

export interface AgentDeskFeed {
  agent: AgentDeskAgent;
  engagements: AgentDeskEngagement[];
  lane_counts: AgentDeskLaneCounts;
  next_cursor: string | null;
  /** Null for a desk outside any space — the copilot's, whose one thread follows the person. */
  space_id: string | null;
}

export function emptyAgentDeskLaneCounts(): AgentDeskLaneCounts {
  return {
    active: 0,
    assigned: 0,
    completed: 0,
    conversation: 0,
    waiting: 0,
  };
}
