import type { AvatarStackProfile } from "@engenty/ui-core";
import type { ProjectListItem } from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";

/**
 * Team member ids to show on project cards/table: project members plus lead when
 * resolvable to a team member row and not already listed.
 */
export function getProjectDisplayMemberIds(
  project: Pick<ProjectListItem, "lead_id" | "project_team">,
  catalog: TeamMemberCatalogRow[]
): string[] {
  const fromProject = [...(project.project_team?.map((m) => m.user_id) ?? [])];
  const unique = [...new Set(fromProject.filter(Boolean))];
  if (project.lead_id?.trim()) {
    const leadRow = catalog.find((m) => m.user_id === project.lead_id);
    const leadUserId = leadRow?.user_id;
    if (leadUserId && !unique.includes(leadUserId)) {
      unique.push(leadUserId);
    }
  }
  return unique;
}

/** Profiles for `AvatarStack` (catalog names when available, else compact fallback). */
export function getProjectDisplayProfiles(
  project: Pick<ProjectListItem, "lead_id" | "project_team">,
  catalog: TeamMemberCatalogRow[],
  memberProfileMap: Map<string, AvatarStackProfile>
): AvatarStackProfile[] {
  const ids = getProjectDisplayMemberIds(project, catalog);
  return ids.map((id) => {
    const fromMap = memberProfileMap.get(id);
    if (fromMap) {
      return fromMap;
    }
    return {
      id,
      full_name: id.length > 12 ? `${id.slice(0, 8)}…` : id,
      avatar_url: null,
    };
  });
}
