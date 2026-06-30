import type { TeamMemberListItem } from "../api.js";
import type { TeamListGroupBy } from "../components/team-list-filters.js";

export interface TeamMembersListGroup {
  key: string;
  label: string;
  members: TeamMemberListItem[];
}

export function resolveTeamMemberListGroupKey(
  member: TeamMemberListItem,
  groupBy: TeamListGroupBy,
  ungroupedLabel: string
): string {
  if (groupBy === "none") {
    return "__all__";
  }
  if (groupBy === "department") {
    return member.department?.trim() || ungroupedLabel;
  }
  if (groupBy === "role") {
    return member.position?.trim() || ungroupedLabel;
  }
  return member.location?.trim() || ungroupedLabel;
}

/**
 * Build display groups from a flat member list.
 *
 * @param termOrder - Ordered label strings from the taxonomy (sort_order respected).
 *   When provided, groups are sorted to match this order; groups whose label is not
 *   found (e.g. free-text department values, or the "ungrouped" fallback) are
 *   appended alphabetically after the taxonomy-ordered groups.
 */
export function buildTeamMembersListGroups(
  members: TeamMemberListItem[],
  groupBy: TeamListGroupBy,
  ungroupedLabel: string,
  termOrder?: string[]
): TeamMembersListGroup[] {
  if (groupBy === "none") {
    return [{ key: "__all__", label: "", members }];
  }

  const map = new Map<string, TeamMemberListItem[]>();
  for (const member of members) {
    const key = resolveTeamMemberListGroupKey(member, groupBy, ungroupedLabel);
    const bucket = map.get(key) ?? [];
    bucket.push(member);
    map.set(key, bucket);
  }

  const entries = [...map.entries()];

  if (termOrder && termOrder.length > 0) {
    // Build a position index for fast lookup (label → index in termOrder).
    const orderIndex = new Map(termOrder.map((label, i) => [label, i]));
    entries.sort(([left], [right]) => {
      const li = orderIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
      const ri = orderIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
      // Both in termOrder → use their defined positions.
      if (
        (li !== Number.MAX_SAFE_INTEGER || ri !== Number.MAX_SAFE_INTEGER) &&
        li !== ri
      ) {
        return li - ri;
      }
      // Both outside termOrder (free-text / ungrouped) → fallback alphabetical.
      return left.localeCompare(right);
    });
  } else {
    entries.sort(([left], [right]) => left.localeCompare(right));
  }

  return entries.map(([key, groupMembers]) => ({
    key,
    label: key,
    members: groupMembers,
  }));
}
