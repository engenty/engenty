export type ProjectListGroupBy = "none" | "client" | "timeframe" | "lead";

export function projectListGroupBySelectOptions(
  t: (key: string) => string
): { value: ProjectListGroupBy; label: string }[] {
  return [
    { value: "none", label: t("filters.groupByNone") },
    { value: "client", label: t("filters.groupByClient") },
    { value: "timeframe", label: t("filters.groupByTimeframe") },
    { value: "lead", label: t("filters.groupByLead") },
  ];
}

export interface ProjectListFilterState {
  clientId?: string;
  groupBy: ProjectListGroupBy;
  leadId?: string;
}

export function hasActiveProjectListChipFilters(
  value: ProjectListFilterState
): boolean {
  return !!(value.clientId || value.leadId);
}

export function hasActiveProjectListFilters(
  value: ProjectListFilterState
): boolean {
  return hasActiveProjectListChipFilters(value) || value.groupBy !== "none";
}

export function clearProjectListFilters(): ProjectListFilterState {
  return { groupBy: "none" };
}
