import type { TeamMemberListItem, TeamMemberUpdateInput } from "../api.js";
import type { TeamMemberDetailPageData } from "../queries.js";

export function patchTeamMember(
  current: TeamMemberListItem | undefined,
  patch: TeamMemberUpdateInput
) {
  return current ? { ...current, ...patch } : current;
}

export function patchTeamMemberDetailPage(
  current: TeamMemberDetailPageData | undefined,
  patch: TeamMemberUpdateInput
) {
  return current
    ? { ...current, member: { ...current.member, ...patch } }
    : current;
}
