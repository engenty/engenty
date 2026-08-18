import { teamMemberCatalogUserId } from "@engenty/tasks/ui/assignee";
import type { MultiSelectGroup, MultiSelectOption } from "@engenty/ui-core";
import type { TeamMemberCatalogRow } from "../plugins.js";

function memberSelectDescription(
  member: TeamMemberCatalogRow
): string | undefined {
  const text =
    member.position?.trim() || member.job_title?.trim() || member.email?.trim();
  return text || undefined;
}

/** Project `team_member_ids` may use auth `user_id` or profile id when unlinked. */
export function projectTeamMemberCatalogId(row: TeamMemberCatalogRow): string {
  return teamMemberCatalogUserId(row);
}

export function buildProjectTeamMemberAddOptions(
  catalog: TeamMemberCatalogRow[],
  memberIds: string[]
): MultiSelectOption[] {
  const currentMembers = new Set(memberIds);
  return catalog
    .filter((member) => !currentMembers.has(projectTeamMemberCatalogId(member)))
    .sort((left, right) => left.full_name.localeCompare(right.full_name))
    .map((member) => {
      const description = memberSelectDescription(member);
      return {
        ...(description ? { description } : {}),
        label: member.full_name,
        value: projectTeamMemberCatalogId(member),
      };
    });
}

function memberMatchesProject(
  member: TeamMemberCatalogRow,
  projectMembers: Set<string>
): boolean {
  if (projectMembers.has(member.id)) {
    return true;
  }
  const catalogId = teamMemberCatalogUserId(member);
  if (projectMembers.has(catalogId)) {
    return true;
  }
  const authUserId = member.user_id?.trim();
  return authUserId ? projectMembers.has(authUserId) : false;
}

export function buildProjectTaskMemberOptions(params: {
  catalog: TeamMemberCatalogRow[];
  projectMemberIds: string[];
  inProjectLabel: string;
  otherTeamMembersLabel: string;
}): MultiSelectGroup[] | MultiSelectOption[] {
  const { catalog, projectMemberIds, inProjectLabel, otherTeamMembersLabel } =
    params;
  const projectMembers = new Set(
    projectMemberIds.map((id) => id.trim()).filter(Boolean)
  );
  const toOption = (member: TeamMemberCatalogRow) => {
    const description = memberSelectDescription(member);
    return {
      ...(description ? { description } : {}),
      label: member.full_name,
      value: teamMemberCatalogUserId(member),
    };
  };

  if (projectMembers.size === 0) {
    return [...catalog]
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
      .map(toOption);
  }

  const inProject = catalog.filter((member) =>
    memberMatchesProject(member, projectMembers)
  );
  const otherMembers = catalog.filter(
    (member) => !memberMatchesProject(member, projectMembers)
  );
  const groups: MultiSelectGroup[] = [];

  if (inProject.length > 0) {
    groups.push({
      heading: inProjectLabel,
      options: [...inProject]
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .map(toOption),
    });
  }

  if (otherMembers.length > 0) {
    groups.push({
      heading: otherTeamMembersLabel,
      options: [...otherMembers]
        .sort((left, right) => left.full_name.localeCompare(right.full_name))
        .map(toOption),
    });
  }

  if (groups.length === 0 && catalog.length > 0) {
    return [...catalog]
      .sort((left, right) => left.full_name.localeCompare(right.full_name))
      .map(toOption);
  }

  return groups;
}

export function countProjectTaskMemberOptions(
  options: MultiSelectGroup[] | MultiSelectOption[]
): number {
  if (options.length === 0) {
    return 0;
  }
  if ("heading" in options[0]) {
    return (options as MultiSelectGroup[]).reduce(
      (total, group) => total + group.options.length,
      0
    );
  }
  return (options as MultiSelectOption[]).length;
}
