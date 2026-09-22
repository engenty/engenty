import { conversationEngagement } from "@engenty/ai-core/browser";
import { copilotRiverPath } from "@engenty/ai-ui";
import { spaceAgentDeskPath, spaceAgentsPath } from "./space-routes";

export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";
export const ENGENTY_COORDINATOR_AGENT_ID = "engenty.coordinator";

/**
 * Which kind of engenty a mounted agent is, for surfaces that must say WHY it
 * is here — the Space settings roster above all. Read entirely off the
 * DECLARED classification the registry response carries (`role`,
 * `managed_by_module`, `source`) — never off the id string.
 *
 * The four kinds answer four different questions about removal:
 * - `platform`: shipped with Engenty, always mounted, never offered in the
 *   picker — the baseline rows the server refuses to unmount.
 * - `module`: arrives with its app. Removing it means unmounting the app, so
 *   the Apps card is the lever, not this one.
 * - `hired`: registered for this workspace (`source: "database"`). The only
 *   kind "manage" can add or remove.
 * - `delegated`: called BY other engentys, never talked to directly — the set
 *   the Work sidebar already hides. Chat surfaces sit here too: nobody
 *   addresses either from the roster.
 */
export type SpaceAgentKind = "delegated" | "hired" | "module" | "platform";

export function resolveSpaceAgentKind(agent: {
  id: string;
  managedByModule?: string | null;
  role?: string | null;
  source?: string | null;
}): SpaceAgentKind {
  if (agent.role === "delegated" || agent.role === "chat_surface") {
    return "delegated";
  }
  if (
    agent.role === "copilot" ||
    agent.role === "coordinator" ||
    agent.role === "external"
  ) {
    return "platform";
  }
  if (agent.managedByModule) {
    return "module";
  }
  return agent.source === "database" ? "hired" : "platform";
}

/**
 * Work-tab agent order: the roster alphabetically by display name.
 */
export function compareSpaceAgents(
  left: { id: string; name: string },
  right: { id: string; name: string }
): number {
  return left.name.localeCompare(right.name);
}

/**
 * Whether a mounted agent belongs in the space Agents roster (Work list and
 * `/s/<key>/agents`).
 *
 * Copilot is the person's, not the space's: its one conversation — the river
 * — heads the Private list and lives on the app bar, never in this roster.
 * Specialists are people you talk to here. A leftover `coordinator` row still
 * lists until unmounted. Chat surfaces live inside their module; delegated
 * sub-agents only run when another agent calls them. All read off the
 * server-derived `role`.
 */
export function isSpaceRosterAgent(agent: {
  id: string;
  role?: string | null;
}): boolean {
  const role = agent.role?.trim() || "specialist";
  return role === "coordinator" || role === "specialist";
}

/**
 * Resolve the user-facing destination for an agent in a Space.
 *
 * The copilot's is the river, opened inside this space. Every other agent
 * has its Space-native desk.
 */
export function resolveSpaceAgentDestination(
  agentId: string,
  spaceKey: string
): string {
  if (agentId === ENGENTY_COPILOT_AGENT_ID) {
    return copilotRiverPath(spaceKey);
  }
  return spaceAgentDeskPath(spaceKey, agentId);
}

/**
 * Where ONE conversation lives — the same destination as the agent, with the
 * thread named (PLAN-space-chats.md).
 *
 * A desk carries it in `?engagement=`. The copilot has exactly one
 * conversation, the river, so its destination names no thread at all.
 */
export function resolveSpaceChatDestination(
  agentId: string,
  spaceKey: string,
  threadId: string
): string {
  const base = resolveSpaceAgentDestination(agentId, spaceKey);
  if (agentId === ENGENTY_COPILOT_AGENT_ID) {
    return base;
  }
  const params = new URLSearchParams({
    engagement: conversationEngagement(threadId),
  });
  return `${base}?${params.toString()}`;
}

/** Guard the legacy Copilot Desk URL; other agents genuinely own a Desk. */
export function resolveSpaceAgentDeskRedirect(
  agentId: string,
  spaceKey: string
): string | null {
  return agentId === ENGENTY_COPILOT_AGENT_ID
    ? resolveSpaceAgentDestination(agentId, spaceKey)
    : null;
}

/**
 * Whether the space sidebar should mark this roster agent as the current page.
 */
export function isSpaceAgentNavActive(
  pathname: string,
  agentId: string,
  spaceKey: string
): boolean {
  const destination = resolveSpaceAgentDestination(agentId, spaceKey);
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

/** Whether the Work-tab Agents heading should read as the current page. */
export function isSpaceAgentsListActive(
  pathname: string,
  spaceKey: string
): boolean {
  return pathname === spaceAgentsPath(spaceKey);
}
