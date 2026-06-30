import type { AvatarStackProfile } from "@engenty/ui-core";
import type { ProjectListItem } from "../api.js";
import type { ProjectListGroupBy } from "../components/project-list-filters.js";

export interface ProjectsListGroup {
  key: string;
  label: string;
  projects: ProjectListItem[];
}

export function resolveProjectListGroupKey(
  project: ProjectListItem,
  groupBy: ProjectListGroupBy,
  ungroupedLabel: string,
  memberProfileMap: Map<string, AvatarStackProfile>,
  t: (key: string) => string
): string {
  if (groupBy === "none") {
    return "__all__";
  }

  if (groupBy === "client") {
    return project.client_name?.trim() || ungroupedLabel;
  }

  if (groupBy === "lead") {
    if (!project.lead_id) {
      return ungroupedLabel;
    }
    const profile = memberProfileMap.get(project.lead_id);
    return profile?.full_name?.trim() || project.lead_id;
  }

  if (groupBy === "timeframe") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const start = project.start_date;
    const end = project.end_date;

    if (!(start || end)) {
      return t("filters.timeframe.noTimeframe");
    }

    if (start && start > todayStr) {
      return t("filters.timeframe.upcoming");
    }

    if (end && end < todayStr) {
      return t("filters.timeframe.completed");
    }

    return t("filters.timeframe.active");
  }

  return ungroupedLabel;
}

export function buildProjectsListGroups(
  projects: ProjectListItem[],
  groupBy: ProjectListGroupBy,
  ungroupedLabel: string,
  memberProfileMap: Map<string, AvatarStackProfile>,
  t: (key: string) => string
): ProjectsListGroup[] {
  if (groupBy === "none") {
    return [{ key: "__all__", label: "", projects }];
  }

  const map = new Map<string, ProjectListItem[]>();
  for (const project of projects) {
    const key = resolveProjectListGroupKey(
      project,
      groupBy,
      ungroupedLabel,
      memberProfileMap,
      t
    );
    const bucket = map.get(key) ?? [];
    bucket.push(project);
    map.set(key, bucket);
  }

  // If grouping by timeframe, we can sort in a custom order: Active, Upcoming, Completed, No timeframe
  const timeframeOrder = [
    t("filters.timeframe.active"),
    t("filters.timeframe.upcoming"),
    t("filters.timeframe.completed"),
    t("filters.timeframe.noTimeframe"),
  ];

  return [...map.entries()]
    .sort(([left], [right]) => {
      if (groupBy === "timeframe") {
        const leftIdx = timeframeOrder.indexOf(left);
        const rightIdx = timeframeOrder.indexOf(right);
        if (leftIdx !== -1 && rightIdx !== -1) {
          return leftIdx - rightIdx;
        }
      }
      return left.localeCompare(right);
    })
    .map(([key, groupProjects]) => ({
      key,
      label: key,
      projects: groupProjects,
    }));
}
