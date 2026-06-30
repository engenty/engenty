export type TeamListGroupBy = "none" | "department" | "role" | "location";

export function teamListGroupBySelectOptions(
  t: (key: string) => string
): { value: TeamListGroupBy; label: string }[] {
  return [
    { value: "none", label: t("filters.groupByNone") },
    { value: "department", label: t("filters.groupByDepartment") },
    { value: "role", label: t("filters.groupByRole") },
    { value: "location", label: t("filters.groupByLocation") },
  ];
}

export interface TeamListFilterState {
  groupBy: TeamListGroupBy;
  groupId?: string;
  locationTermId?: string;
  roleTermId?: string;
}

export function hasActiveTeamListChipFilters(
  value: TeamListFilterState
): boolean {
  return !!(value.roleTermId || value.locationTermId || value.groupId);
}

export function hasActiveTeamListFilters(value: TeamListFilterState): boolean {
  return hasActiveTeamListChipFilters(value) || value.groupBy !== "none";
}

export function clearTeamListFilters(): TeamListFilterState {
  return { groupBy: "none" };
}
