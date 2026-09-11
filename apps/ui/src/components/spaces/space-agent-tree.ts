/**
 * The roster as the space's engenties see it: coordinators at the top, the
 * teammates that report to them underneath, the apps' own agents apart.
 *
 * A coordinator is a position, not a kind — a hired engenty whose mount has
 * no `reports_to` (PLAN-agent-rooms.md D8). The assembler already gives that
 * position the setup and hiring tools; this is the same rule drawn as a tree.
 * A report whose manager left the space becomes a coordinator by that rule,
 * so nothing is ever orphaned off the page.
 */
import type { SpaceRosterAgent } from "@/lib/use-space-roster-agents";

export interface SpaceAgentTreeNode {
  agent: SpaceRosterAgent;
  reports: SpaceAgentTreeNode[];
}

export interface SpaceAgentTree {
  /** Hired engenties with nobody above them, each with its reports nested. */
  coordinators: SpaceAgentTreeNode[];
  /** Agents an app brought along; they answer to their module, not to a person. */
  fromApps: SpaceRosterAgent[];
}

export function isCoordinator(
  agent: SpaceRosterAgent,
  rosterIds: ReadonlySet<string>
): boolean {
  if (agent.source === "module") {
    return false;
  }
  const manager = agent.reportsTo?.trim();
  return !(manager && rosterIds.has(manager));
}

export function buildSpaceAgentTree(
  agents: readonly SpaceRosterAgent[]
): SpaceAgentTree {
  const rosterIds = new Set(agents.map((agent) => agent.id));
  const fromApps = agents.filter((agent) => agent.source === "module");
  const hired = agents.filter((agent) => agent.source !== "module");
  const reportsOf = new Map<string, SpaceRosterAgent[]>();
  for (const agent of hired) {
    if (isCoordinator(agent, rosterIds)) {
      continue;
    }
    const manager = agent.reportsTo as string;
    const list = reportsOf.get(manager) ?? [];
    list.push(agent);
    reportsOf.set(manager, list);
  }
  // A cycle (a reports to b reports to a) has no coordinator; both would
  // vanish. Guard by never visiting an id twice.
  const seen = new Set<string>();
  const node = (agent: SpaceRosterAgent): SpaceAgentTreeNode => {
    seen.add(agent.id);
    return {
      agent,
      reports: (reportsOf.get(agent.id) ?? [])
        .filter((report) => !seen.has(report.id))
        .map(node),
    };
  };
  const coordinators = hired
    .filter((agent) => isCoordinator(agent, rosterIds))
    .map(node);
  for (const agent of hired) {
    if (!seen.has(agent.id)) {
      coordinators.push(node(agent));
    }
  }
  return { coordinators, fromApps };
}
