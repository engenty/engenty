import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@engenty/query-client";
import { useEffect, useState } from "react";
import type {
  ProjectCreateInput,
  ProjectsQueryParams,
  ProjectTasksQueryParams,
} from "./api.js";
import {
  createProject,
  deleteProject,
  getAssociatedTaskCount,
  getProjectSettings,
  getProjects,
  getTaskCounts,
  getTasks,
  updateTask,
} from "./api.js";
import type { ContactsPluginApi } from "./plugins.js";

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

export function useProjectsList(params: ProjectsQueryParams) {
  return useQuery(projectsListOptions(params));
}

export function projectTasksListOptions(params: ProjectTasksQueryParams) {
  return queryOptions({
    queryKey: projectKeys.tasksList(params),
    queryFn: ({ signal }) => getTasks(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useProjectTasksList(params: ProjectTasksQueryParams) {
  return useQuery(projectTasksListOptions(params));
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
  >
) {
  return useQuery(projectTaskCountsOptions(params));
}

export function useCreateProjectMutation(params: ProjectsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectCreateInput) => createProject(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectKeys.list(params),
      });
    },
  });
}

export function useDeleteProjectMutation(params: ProjectsQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string | { id: string; deleteTasks?: boolean }) => {
      const id = typeof input === "string" ? input : input.id;
      const deleteTasks =
        typeof input === "string" ? undefined : input.deleteTasks;
      return deleteProject(id, { deleteTasks });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: projectKeys.list(params),
      });
    },
  });
}

export function useUpdateTaskMutation(listParams?: ProjectTasksQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      taskId,
      patch,
    }: {
      projectId: string;
      taskId: string;
      patch: Parameters<typeof updateTask>[2];
    }) => updateTask(projectId, taskId, patch),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.all });
      if (listParams) {
        await queryClient.invalidateQueries({
          queryKey: projectKeys.tasksList(listParams),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: [...projectKeys.all, variables.projectId],
      });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: projectKeys.all });
      if (listParams) {
        await queryClient.invalidateQueries({
          queryKey: projectKeys.tasksList(listParams),
        });
      }
    },
  });
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
