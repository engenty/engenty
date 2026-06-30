export const TEAM_MODULE_BASE = "/mdl/team";
export const TEAM_MODULE_SETTINGS_PATH = `${TEAM_MODULE_BASE}/settings`;

export const TEAM_GLOBAL_SETTINGS_BASE = "/settings/team";
export const TEAM_GLOBAL_SETTINGS_TAXONOMIES_PATH = `${TEAM_GLOBAL_SETTINGS_BASE}/taxonomies`;
export const TEAM_GLOBAL_SETTINGS_FIELDS_PATH = `${TEAM_GLOBAL_SETTINGS_BASE}/fields`;

export function isTeamSettingsPath(pathname: string): boolean {
  return (
    pathname === TEAM_MODULE_SETTINGS_PATH ||
    pathname.startsWith(`${TEAM_MODULE_SETTINGS_PATH}/`)
  );
}

export const TEAM_AGENTS_PATH = `${TEAM_MODULE_BASE}/agents`;
export const TEAM_GRAPH_PATH = `${TEAM_MODULE_BASE}/graph`;
export const TEAM_IMPORT_PATH = `${TEAM_MODULE_BASE}/import`;

export function teamMemberDetailPath(id: string) {
  return `${TEAM_MODULE_BASE}/${id}`;
}

export function teamMemberEditPath(id: string) {
  return `${TEAM_MODULE_BASE}/${id}/edit`;
}

export function teamMemberHrDetailPath(id: string) {
  return `${TEAM_MODULE_BASE}/${id}/hr`;
}

export function teamMemberHrEditPath(id: string) {
  return `${TEAM_MODULE_BASE}/${id}/hr/edit`;
}

export function teamAgentDetailPath(agentId: string) {
  return `${TEAM_AGENTS_PATH}/${encodeURIComponent(agentId)}`;
}
