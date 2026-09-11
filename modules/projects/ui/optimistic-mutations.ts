import {
  createOptimisticId,
  patchOptimisticItems,
  prependOptimisticItem,
  reconcileOptimisticItem,
  removeOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  ProjectCreateInput,
  ProjectListItem,
  ProjectsPaginatedResponse,
  ProjectsQueryParams,
  ProjectTaskListItem,
  ProjectTasksPaginatedResponse,
  ProjectTasksQueryParams,
} from "./api.js";
import { createProject, deleteProject, updateTask } from "./api.js";
import {
  type ProjectSpaceScope,
  useProjectSpaceScope,
  withProjectSpaceScope,
} from "./lib/use-project-space-scope.js";
import { projectKeys } from "./queries.js";

export function optimisticProject(
  input: ProjectCreateInput,
  id: string,
  now = new Date().toISOString()
): ProjectListItem {
  return {
    briefing: input.briefing ?? null,
    client_id: input.client_id,
    client_name: input.client_name,
    created_at: now,
    created_by: input.created_by ?? null,
    enabled_tabs: input.enabled_tabs ?? null,
    end_date: input.end_date ?? null,
    id,
    lead_id: input.lead_id ?? null,
    portal_enabled: input.portal_enabled ?? false,
    scope_id: "",
    space_id: input.space_id ?? "",
    start_date: input.start_date ?? null,
    tenant_id: "",
    timeplan_enabled: input.timeplan_enabled ?? true,
    title: input.title,
    updated_at: now,
  };
}

export function projectMatchesList(
  project: ProjectListItem,
  params: ProjectsQueryParams
): boolean {
  return (
    (!params.client_id || project.client_id === params.client_id) &&
    (!params.lead_id || project.lead_id === params.lead_id) &&
    (!params.space_id || project.space_id === params.space_id) &&
    (!params.search ||
      project.title.toLowerCase().includes(params.search.toLowerCase()))
  );
}

function taskMatches(
  task: ProjectTaskListItem,
  params: ProjectTasksQueryParams
): boolean {
  return (
    (!params.project_id || task.project_id === params.project_id) &&
    (!params.phase_id || task.phase_id === params.phase_id) &&
    (!params.status || task.status === params.status) &&
    (!params.search ||
      task.title.toLowerCase().includes(params.search.toLowerCase()))
  );
}

export function useCreateProjectMutation(
  params: ProjectsQueryParams,
  options: { scope?: ProjectSpaceScope } = {}
) {
  const queryClient = useQueryClient();
  const spaceId = useProjectSpaceScope(options.scope);
  const listParams = withProjectSpaceScope(params, spaceId);
  return useMutation({
    mutationFn: (input: ProjectCreateInput) =>
      createProject(withProjectSpaceScope(input, spaceId)),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const optimistic = optimisticProject(
        withProjectSpaceScope(input, spaceId),
        optimisticId
      );
      const queryKey = projectKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<ProjectsPaginatedResponse>(
        queryKey,
        (current) =>
          projectMatchesList(optimistic, listParams)
            ? prependOptimisticItem(current, optimistic)
            : current
      );
      return { optimisticId, queryKey };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<ProjectsPaginatedResponse>(
          context.queryKey,
          (current) =>
            removeOptimisticItems(current, new Set([context.optimisticId]))
        );
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }
      toast.error("Could not create the project.");
    },
    onSuccess: (saved, _input, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData<ProjectsPaginatedResponse>(
        context.queryKey,
        (current) =>
          reconcileOptimisticItem(current, context.optimisticId, saved)
      );
    },
  });
}

export function useDeleteProjectMutation(
  params: ProjectsQueryParams,
  options: { scope?: ProjectSpaceScope } = {}
) {
  const queryClient = useQueryClient();
  const spaceId = useProjectSpaceScope(options.scope);
  const listParams = withProjectSpaceScope(params, spaceId);
  return useMutation({
    mutationFn: (input: string | { id: string; deleteTasks?: boolean }) => {
      const id = typeof input === "string" ? input : input.id;
      return deleteProject(id, {
        deleteTasks: typeof input === "string" ? undefined : input.deleteTasks,
      });
    },
    onMutate: async (input) => {
      const id = typeof input === "string" ? input : input.id;
      const queryKey = projectKeys.list(listParams);
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      queryClient.setQueryData<ProjectsPaginatedResponse>(queryKey, (current) =>
        removeOptimisticItems(current, new Set([id]))
      );
      return { id };
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.error("Could not delete the project. The list is refreshing.");
    },
    onSuccess: (_saved, input) => {
      const deleteTasks =
        typeof input === "object" && input.deleteTasks === true;
      if (deleteTasks) {
        void queryClient.invalidateQueries({
          queryKey: [...projectKeys.all, "tasks"],
        });
      }
    },
  });
}

export function useUpdateProjectTaskMutation(
  _listParams?: ProjectTasksQueryParams
) {
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
    onMutate: async ({ taskId, patch }) => {
      await queryClient.cancelQueries({
        queryKey: [...projectKeys.all, "tasks"],
      });
      for (const [
        key,
        current,
      ] of queryClient.getQueriesData<ProjectTasksPaginatedResponse>({
        queryKey: [...projectKeys.all, "tasks", "list"],
      })) {
        const params = key.at(-1) as ProjectTasksQueryParams;
        queryClient.setQueryData(
          key,
          patchOptimisticItems(current, new Set([taskId]), patch, (task) =>
            taskMatches(task, params)
          )
        );
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: [...projectKeys.all, "tasks"],
      });
      toast.error("Could not move the task. The board is refreshing.");
    },
    onSuccess: (saved, { taskId }) => {
      for (const [
        key,
        current,
      ] of queryClient.getQueriesData<ProjectTasksPaginatedResponse>({
        queryKey: [...projectKeys.all, "tasks", "list"],
      })) {
        queryClient.setQueryData(
          key,
          patchOptimisticItems(current, new Set([taskId]), saved)
        );
      }
    },
  });
}
