import { normalizeInstructionFilename } from "../../lib/admin/instruction-settings-api";

export const AGENTS_WORKSPACE_ROOT_PATH = "/admin/engenty";
export const AGENTS_CATALOG_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/agents`;
export const ACTIONS_CATALOG_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/actions`;
export const SKILLS_CATALOG_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/skills`;
export const TOOLS_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/tools`;
export const ARTIFACTS_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/artifacts`;
export const ACTIVITY_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/activity`;
/** Owned by the connections module; ai-ui only links to it from the sidebar. */
export const CONNECTIONS_ROOT_PATH = `${AGENTS_WORKSPACE_ROOT_PATH}/connections`;

function withSearch(
  pathname: string,
  values: Record<string, string | null | undefined>
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value && value.trim().length > 0) {
      search.set(key, value);
    }
  }
  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  return `${pathname}${suffix}`;
}

// ── Workspace root ────────────────────────────────────────────────────────────

export function buildAgentsWorkspacePath() {
  return AGENTS_WORKSPACE_ROOT_PATH;
}

// ── Agents catalog ────────────────────────────────────────────────────────────

export function buildAgentsCatalogPath() {
  return AGENTS_CATALOG_ROOT_PATH;
}

/** Create a new custom agent. */
export function buildAgentCreatePath() {
  return `${AGENTS_CATALOG_ROOT_PATH}/new`;
}

/** Edit an existing custom agent. */
export function buildAgentEditPath(agentId: string) {
  return `${AGENTS_CATALOG_ROOT_PATH}/${encodeURIComponent(agentId)}/edit`;
}

// ── Agent detail (/agents/:agentId/...) ───────────────────────────────────────

export function buildAgentDetailPath(agentId: string) {
  return `${AGENTS_CATALOG_ROOT_PATH}/${encodeURIComponent(agentId)}`;
}

export function buildAgentInstructionsPath(
  agentId: string,
  options?: { file?: string | null }
) {
  return withSearch(`${buildAgentDetailPath(agentId)}/instructions`, {
    file: options?.file ? normalizeInstructionFilename(options.file) : null,
  });
}

export function buildAgentCapabilitiesPath(agentId: string) {
  return `${buildAgentDetailPath(agentId)}/capabilities`;
}

export function buildAgentWorkspacePath(agentId: string) {
  return `${buildAgentDetailPath(agentId)}/workspace`;
}

export function buildAgentActivityPath(agentId: string) {
  return `${buildAgentDetailPath(agentId)}/activity`;
}

export function buildAgentSessionsPath(
  agentId: string,
  options?: { filter?: string | null }
) {
  return withSearch(`${buildAgentDetailPath(agentId)}/sessions`, {
    filter: options?.filter ?? null,
  });
}

export function buildAgentSessionDetailPath(
  agentId: string,
  threadId: string,
  options?: { filter?: string | null }
) {
  return withSearch(
    `${buildAgentDetailPath(agentId)}/sessions/${encodeURIComponent(threadId)}`,
    { filter: options?.filter ?? null }
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

export function buildActivityPath() {
  return ACTIVITY_ROOT_PATH;
}

// ── Connections ───────────────────────────────────────────────────────────────

export function buildConnectionsPath() {
  return CONNECTIONS_ROOT_PATH;
}

export function buildConnectionDetailPath(connectorId: string) {
  return `${CONNECTIONS_ROOT_PATH}/${encodeURIComponent(connectorId)}`;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

export function buildToolsPath() {
  return TOOLS_ROOT_PATH;
}

// ── Artifacts ─────────────────────────────────────────────────────────────────

export function buildArtifactsPath() {
  return ARTIFACTS_ROOT_PATH;
}

export function buildArtifactDetailPath(artifactId: string) {
  return `${ARTIFACTS_ROOT_PATH}/${encodeURIComponent(artifactId)}`;
}

export function buildToolCreatePath() {
  return `${TOOLS_ROOT_PATH}/new`;
}

export function buildToolEditPath(toolId: string) {
  return `${TOOLS_ROOT_PATH}/${encodeURIComponent(toolId)}/edit`;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function buildActionsCatalogPath() {
  return ACTIONS_CATALOG_ROOT_PATH;
}

export function buildActionDetailPath(
  actionId: string,
  options?: { file?: string | null; view?: "code" | null }
) {
  return withSearch(
    `${ACTIONS_CATALOG_ROOT_PATH}/${encodeURIComponent(actionId)}`,
    {
      file: options?.file ?? null,
      view: options?.view === "code" ? "code" : null,
    }
  );
}

// ── Skills ────────────────────────────────────────────────────────────────────

export function buildSkillsCatalogPath() {
  return SKILLS_CATALOG_ROOT_PATH;
}

export function buildSkillDetailPath(
  skillId: string,
  options?: { file?: string | null; view?: "code" | null }
) {
  return withSearch(
    `${SKILLS_CATALOG_ROOT_PATH}/${encodeURIComponent(skillId)}`,
    {
      file: options?.file ?? null,
      view: options?.view === "code" ? "code" : null,
    }
  );
}

// ── Misc ──────────────────────────────────────────────────────────────────────

export function withWorkspaceParam(
  searchParams: URLSearchParams,
  key: string,
  value: string | null
) {
  const next = new URLSearchParams(searchParams);
  if (value && value.trim().length > 0) {
    next.set(key, value);
  } else {
    next.delete(key);
  }
  return next;
}
