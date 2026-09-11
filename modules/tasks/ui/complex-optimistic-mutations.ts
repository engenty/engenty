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
  TaskCreateInput,
  TasksPaginatedResponse,
  TasksQueryParams,
  TaskUpdateInput,
} from "../src/schema/types.js";
import { createTask, deleteTask, updateTask } from "./api.js";
import {
  optimisticTask,
  taskMatchesList,
} from "./lib/task-list-optimistic-cache.js";
import { useTaskSpaceScope } from "./lib/use-task-space-scope.js";
import { taskKeys } from "./tasks-queries.js";

function updateTaskLists(
  queryClient: ReturnType<typeof useQueryClient>,
  update: (
    current: TasksPaginatedResponse | undefined,
    params: TasksQueryParams
  ) => TasksPaginatedResponse | undefined
) {
  for (const [
    key,
    current,
  ] of queryClient.getQueriesData<TasksPaginatedResponse>({
    queryKey: [...taskKeys.all, "list"],
  })) {
    queryClient.setQueryData(
      key,
      update(current, key.at(-1) as TasksQueryParams)
    );
  }
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();
  // Same space rule as the lists: created where the user is standing. Only
  // when nothing else already decides the space — an explicit space or a
  // parent task (the server inherits from those) win over the URL.
  const spaceId = useTaskSpaceScope();
  const withSpace = (input: TaskCreateInput): TaskCreateInput =>
    input.space_id || input.parent_id || !spaceId
      ? input
      : { ...input, space_id: spaceId };
  return useMutation({
    mutationFn: (input: TaskCreateInput) => createTask(withSpace(input)),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const optimistic = optimisticTask(withSpace(input), optimisticId);
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      updateTaskLists(queryClient, (current, params) =>
        taskMatchesList(optimistic, params)
          ? prependOptimisticItem(current, optimistic)
          : current
      );
      return { optimisticId };
    },
    onError: (_error, _input, context) => {
      if (context) {
        updateTaskLists(queryClient, (current) =>
          removeOptimisticItems(current, new Set([context.optimisticId]))
        );
      }
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      toast.error("Could not create the task.");
    },
    onSuccess: (saved, _input, context) => {
      if (context) {
        updateTaskLists(queryClient, (current) =>
          reconcileOptimisticItem(current, context.optimisticId, saved)
        );
      }
      queryClient.setQueryData(taskKeys.detail(saved.id), saved);
    },
  });
}

export function useUpdateTasksListMutation(_params: TasksQueryParams) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      input,
    }: {
      taskId: string;
      input: TaskUpdateInput;
    }) => updateTask(taskId, input),
    onMutate: async ({ taskId, input }) => {
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      updateTaskLists(queryClient, (current, params) =>
        patchOptimisticItems(current, new Set([taskId]), input, (task) =>
          taskMatchesList(task, params)
        )
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      toast.error("Could not update the task. The list is refreshing.");
    },
    onSuccess: (saved) => {
      updateTaskLists(queryClient, (current, params) =>
        taskMatchesList(saved, params)
          ? patchOptimisticItems(current, new Set([saved.id]), saved)
          : removeOptimisticItems(current, new Set([saved.id]))
      );
      queryClient.setQueryData(taskKeys.detail(saved.id), saved);
    },
  });
}

export function useDeleteTaskMutation() {
  return useDeleteTasksMutation((id: string) => [id]);
}

export function useBulkDeleteTasksMutation() {
  return useDeleteTasksMutation((ids: string[]) => ids);
}

function useDeleteTasksMutation<T>(toIds: (input: T) => string[]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      await Promise.all(toIds(input).map((id) => deleteTask(id)));
    },
    onMutate: async (input) => {
      const ids = new Set(toIds(input));
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      updateTaskLists(queryClient, (current) =>
        removeOptimisticItems(current, ids)
      );
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
      }
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      toast.error("Could not delete every task. The list is refreshing.");
    },
  });
}

export function useBulkUpdateTasksMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskIds,
      input,
    }: {
      taskIds: string[];
      input: TaskUpdateInput;
    }) => await Promise.all(taskIds.map((id) => updateTask(id, input))),
    onMutate: async ({ taskIds, input }) => {
      const ids = new Set(taskIds);
      await queryClient.cancelQueries({ queryKey: taskKeys.all });
      updateTaskLists(queryClient, (current, params) =>
        patchOptimisticItems(current, ids, input, (task) =>
          taskMatchesList(task, params)
        )
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: taskKeys.all });
      toast.error("Could not update every task. The list is refreshing.");
    },
    onSuccess: (saved) => {
      for (const task of saved) {
        queryClient.setQueryData(taskKeys.detail(task.id), task);
      }
    },
  });
}
