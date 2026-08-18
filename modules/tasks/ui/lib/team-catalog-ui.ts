import type { MultiSelectOption } from "@engenty/ui-core";
import type { TeamMemberCatalogRow } from "../plugins.js";

export function teamMemberCatalogUserId(row: TeamMemberCatalogRow): string {
  return row.user_id ?? row.id;
}

export function teamMemberSelectDescription(
  member: TeamMemberCatalogRow
): string | undefined {
  const text =
    member.position?.trim() || member.job_title?.trim() || member.email?.trim();
  return text || undefined;
}

function toTeamMemberSelectOption(
  member: TeamMemberCatalogRow,
  value: string
): MultiSelectOption {
  const description = teamMemberSelectDescription(member);
  return {
    ...(description ? { description } : {}),
    label: member.full_name,
    value,
  };
}

export function buildTaskAssigneeMemberOptions(
  catalog: TeamMemberCatalogRow[]
): MultiSelectOption[] {
  return catalog
    .filter((member) => member.user_id !== null)
    .sort((left, right) => left.full_name.localeCompare(right.full_name))
    .map((member) =>
      toTeamMemberSelectOption(member, member.user_id as string)
    );
}
