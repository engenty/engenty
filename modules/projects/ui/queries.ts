import {
  keepPreviousData,
  queryOptions,
  useQuery,
} from "@engenty/query-client";
import { useEffect, useState } from "react";
import type { ProjectsQueryParams, ProjectTasksQueryParams } from "./api.js";
import {
  getAssociatedTaskCount,
  getProjectSettings,
  getProjects,
  getTaskCounts,
  getTasks,
} from "./api.js";
import {
  type ProjectSpaceScope,
  useProjectSpaceScope,
  withProjectSpaceScope,
} from "./lib/use-project-space-scope.js";
import type { ContactsPluginApi } from "./plugins.js";

// biome-ignore lint/performance/noBarrelFile: preserve established query-hook imports
export {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useUpdateProjectTaskMutation as useUpdateTaskMutation,
} from "./optimistic-mutations.js";

export const projectKeys = {
  all: ["projects"] as const,
  settings: () => [...projectKeys.all, "settings"] as const,
  detail: (id: string) => [...projectKeys.all, "detail", id] as const,
  list: (params: ProjectsQueryParams) =>
    [...projectKeys.all, "list", params] as const,
  tasksList: (params: ProjectTasksQueryParams) =>
    [...projectKeys.all, "tasks", "list", params] as const,
  taskCounts: (
    params: Omit<
      ProjectTasksQueryParams,
      "page" | "pageSize" | "sortBy" | "sortOrder"
    >
  ) => [...projectKeys.all, "tasks", "counts", params] as const,
  associatedTaskCount: (projectId: string) =>
    [...projectKeys.all, "associated-task-count", projectId] as const,
  createModalEntitySearch: (search: string) =>
    [...projectKeys.all, "create-modal", "entity-search", search] as const,
};

export function projectSettingsOptions() {
  return queryOptions({
    queryKey: projectKeys.settings(),
    queryFn: ({ signal }) => getProjectSettings(signal),
  });
}

export function useProjectSettings() {
  return useQuery(projectSettingsOptions());
}

export function projectsListOptions(params: ProjectsQueryParams) {
  return queryOptions({
    queryKey: projectKeys.list(params),
    queryFn: ({ signal }) => getProjects(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useProjectsList(
  params: ProjectsQueryParams,
  options: { scope?: ProjectSpaceScope } = {}
) {
  const spaceId = useProjectSpaceScope(options.scope);
  return useQuery(projectsListOptions(withProjectSpaceScope(params, spaceId)));
}

export function projectTasksListOptions(params: ProjectTasksQueryParams) {
  return queryOptions({
    queryKey: projectKeys.tasksList(params),
    queryFn: ({ signal }) => getTasks(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useProjectTasksList(
  params: ProjectTasksQueryParams,
  options: { scope?: ProjectSpaceScope } = {}
) {
  const spaceId = useProjectSpaceScope(options.scope);
  return useQuery(
    projectTasksListOptions(withProjectSpaceScope(params, spaceId))
  );
}

export function projectTaskCountsOptions(
  params: Omit<
    ProjectTasksQueryParams,
    "page" | "pageSize" | "sortBy" | "sortOrder"
  >
) {
  return queryOptions({
    queryKey: projectKeys.taskCounts(params),
    queryFn: ({ signal }) => getTaskCounts(params, signal),
  });
}

export function projectAssociatedTaskCountOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.associatedTaskCount(projectId),
    queryFn: ({ signal }) => getAssociatedTaskCount(projectId, signal),
  });
}

export function useProjectTaskCounts(
  params: Omit<
    ProjectTasksQueryParams,
    "page" | "pageSize" | "sortBy" | "sortOrder"
  >,
  options: { scope?: ProjectSpaceScope } = {}
) {
  const spaceId = useProjectSpaceScope(options.scope);
  return useQuery(
    projectTaskCountsOptions(withProjectSpaceScope(params, spaceId))
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function projectEntitySearchOptions(
  contactsPlugin: ContactsPluginApi | null,
  search: string,
  enabled: boolean
) {
  return queryOptions({
    queryKey: projectKeys.createModalEntitySearch(search),
    queryFn: ({ signal }) =>
      contactsPlugin!
        .getContacts(
          { search: search.trim() || undefined, pageSize: 20 },
          signal
        )
        .then((data) =>
          (data ?? []).map((e) => ({
            id: e.id,
            display_name: e.display_name,
          }))
        ),
    enabled: enabled && !!contactsPlugin,
  });
}

export function useProjectEntitySearchQuery(
  contactsPlugin: ContactsPluginApi | null,
  search: string,
  enabled: boolean,
  debounceMs = 200
) {
  const debouncedSearch = useDebouncedValue(search, debounceMs);
  return useQuery(
    projectEntitySearchOptions(contactsPlugin, debouncedSearch, enabled)
  );
}
