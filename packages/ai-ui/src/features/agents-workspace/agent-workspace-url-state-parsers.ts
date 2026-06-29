/**
 * Route parsers for /admin/engenty — updated for the Batch 1 route scheme.
 *
 * Agent detail now lives under /admin/engenty/agents/:agentId/...
 * Reserved first-segments: agents, skills, tools, actions, activity.
 */

import {
  ACTIVITY_ROOT_PATH,
  AGENTS_CATALOG_ROOT_PATH,
  AGENTS_WORKSPACE_ROOT_PATH,
  TOOLS_ROOT_PATH,
} from "./agent-workspace-paths";

export type AgentsWorkspaceSection =
  | "agents-catalog"
  | "landing"
  | "actions"
  | "activity"
  | "capabilities"
  | "overview"
  | "instructions"
  | "workspace"
  | "sessions"
  | "skills"
  | "tools";

function escapeRegexLiteral(path: string): string {
  return path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse agent session-detail URL:
 *   `/admin/engenty/agents/:agentId/sessions/:threadId`
 *
 * Returns { agentId, threadId } or null.
 */
export function parseAgentSessionDetailFromPathname(
  pathname: string
): { agentId: string; threadId: string } | null {
  const escaped = escapeRegexLiteral(AGENTS_CATALOG_ROOT_PATH);
  const match = pathname.match(
    new RegExp(`^${escaped}/([^/]+)/sessions/([^/?#]+)$`)
  );
  if (!match) {
    return null;
  }
  return {
    agentId: decodeURIComponent(match[1]),
    threadId: decodeURIComponent(match[2]),
  };
}

export function parseAgentsWorkspaceSection(
  pathname: string
): AgentsWorkspaceSection | null {
  if (pathname === AGENTS_WORKSPACE_ROOT_PATH) {
    return "landing";
  }
  const agentBase = escapeRegexLiteral(AGENTS_CATALOG_ROOT_PATH);

  const instructionsPattern = new RegExp(`^${agentBase}/[^/]+/instructions$`);
  if (instructionsPattern.test(pathname)) {
    return "instructions";
  }

  const capabilitiesPattern = new RegExp(`^${agentBase}/[^/]+/capabilities$`);
  if (capabilitiesPattern.test(pathname)) {
    return "capabilities";
  }

  const workspacePattern = new RegExp(`^${agentBase}/[^/]+/workspace$`);
  if (workspacePattern.test(pathname)) {
    return "workspace";
  }

  const agentActivityPattern = new RegExp(`^${agentBase}/[^/]+/activity$`);
  if (agentActivityPattern.test(pathname)) {
    return "activity";
  }

  const agentSessionsPattern = new RegExp(
    `^${agentBase}/[^/]+/sessions(?:/[^/]+)?$`
  );
  if (agentSessionsPattern.test(pathname)) {
    return "sessions";
  }

  // Activity (formerly sessions catalog)
  if (
    pathname === ACTIVITY_ROOT_PATH ||
    pathname.startsWith(`${ACTIVITY_ROOT_PATH}/`)
  ) {
    return "sessions";
  }

  const base = escapeRegexLiteral(AGENTS_WORKSPACE_ROOT_PATH);

  const actionsPattern = new RegExp(`^${base}/actions(?:/[^/]+)?$`);
  if (actionsPattern.test(pathname)) {
    return "actions";
  }

  if (
    pathname === TOOLS_ROOT_PATH ||
    pathname.startsWith(`${TOOLS_ROOT_PATH}/`)
  ) {
    return "tools";
  }

  const skillsPattern = new RegExp(`^${base}/skills(?:/[^/]+)?$`);
  if (skillsPattern.test(pathname)) {
    return "skills";
  }

  if (
    pathname === AGENTS_CATALOG_ROOT_PATH ||
    pathname.startsWith(`${AGENTS_CATALOG_ROOT_PATH}/`)
  ) {
    return "agents-catalog";
  }

  // Catch-all for /admin/engenty itself
  const overviewPattern = new RegExp(`^${base}/[^/]+$`);
  if (overviewPattern.test(pathname)) {
    return "overview";
  }

  return null;
}
