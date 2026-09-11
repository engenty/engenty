import { conversationEngagement } from "@engenty/ai-core/browser";
import {
  spaceAgentDeskPath,
  spaceAgentsPath,
  spaceModulePath,
} from "./space-routes";

export const ENGENTY_COPILOT_AGENT_ID = "engenty.copilot";
export const ENGENTY_COORDINATOR_AGENT_ID = "engenty.coordinator";
const ENGENTY_COPILOT_MODULE_ID = "engenty-copilot";

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
 * Copilot is the platform assistant: rail + Work-tab root, not a desk here.
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
 * Resolve the user-facing destination for an agent mounted in a Space.
 *
 * Copilot keeps a full-page chat as a deep link (bookmarks, Chats, the rail
 * and the Work-tab root). Other mounted agents use the Space-native Desk.
 */
export function resolveSpaceAgentDestination(
  agentId: string,
  spaceKey: string
): string {
  if (agentId === ENGENTY_COPILOT_AGENT_ID) {
    return spaceModulePath(spaceKey, ENGENTY_COPILOT_MODULE_ID, "chat");
  }
  return spaceAgentDeskPath(spaceKey, agentId);
}

/**
 * Where ONE conversation lives — the same destination as the agent, with the
 * thread named (PLAN-space-chats.md).
 *
 * Two shapes, because the two surfaces address a thread differently and always
 * have: the Copilot's full-page chat carries it in the PATH, a Desk carries it
 * in `?engagement=`. Building both here rather than at each call site is what
 * stops a row in the space's Chats list from opening the right agent on the
 * wrong (or no) conversation — a failure that looks like the chat was lost.
 */
export function resolveSpaceChatDestination(
  agentId: string,
  spaceKey: string,
  threadId: string
): string {
  const base = resolveSpaceAgentDestination(agentId, spaceKey);
  if (agentId === ENGENTY_COPILOT_AGENT_ID) {
    return `${base}/${encodeURIComponent(threadId)}`;
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
