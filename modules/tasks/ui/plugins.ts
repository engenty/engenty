import type { EngentyPluginsApi } from "@engenty/ui-plugin-sdk";

export interface TeamMemberCatalogRow {
  full_name: string;
  id: string;
  job_title?: string | null;
  member_type?: "internal" | "external" | "contractor";
  position?: string | null;
  user_id: string | null;
}

export interface TeamMembersPluginApi {
  getTeamMembers: (
    params?: { page?: number; pageSize?: number; search?: string },
    signal?: AbortSignal
  ) => Promise<TeamMemberCatalogRow[]>;
  [key: string]: unknown;
}

let pluginsApi: EngentyPluginsApi | null = null;

export function setTasksPluginsApi(api: EngentyPluginsApi | null) {
  pluginsApi = api;
}

export function getTeamMembersPluginState(): {
  api: TeamMembersPluginApi | null;
  enabled: boolean;
} {
  const enabled = pluginsApi?.isPluginEnabled("team") ?? false;
  return {
    enabled,
    api: enabled
      ? (pluginsApi?.get<TeamMembersPluginApi>("team") ?? null)
      : null,
  };
}

export function buildAssigneeProfileMap(
  rows: TeamMemberCatalogRow[]
): Map<string, { full_name: string; id: string }> {
  const map = new Map<string, { full_name: string; id: string }>();
  for (const member of rows) {
    const profile = {
      id: member.user_id ?? member.id,
      full_name: member.full_name,
    };
    map.set(member.id, profile);
    if (member.user_id) {
      map.set(member.user_id, profile);
    }
  }
  return map;
}

export function getTasksPluginsApi(): EngentyPluginsApi | null {
  return pluginsApi;
}
