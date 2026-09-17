import { useTranslation } from "@engenty/i18n/ui";
import {
  beginOptimisticUpdate,
  createOptimisticId,
  removeOptimisticItems,
  useMutation,
  useQueryClient,
} from "@engenty/query-client";
import { toast } from "sonner";
import type {
  PhaseTask,
  ProjectsPaginatedResponse,
  ProjectsQueryParams,
  ProjectUpdateInput,
  ProjectWithPhasesAndTasks,
} from "./api.js";
import {
  createPhase,
  createTask,
  deletePhase,
  deleteProject,
  deleteTask,
  updatePhase,
  updatePhaseVisibility,
  updateProject,
  updateTask,
  updateTaskVisibility,
} from "./api.js";
import {
  insertPhase,
  optimisticPhase,
  type ProjectPhaseCreateInput,
  type ProjectPhasePatch,
  patchPhase,
  patchProject,
  reconcilePhase,
  removePhase,
} from "./lib/project-detail-phase-cache.js";
import {
  insertTask,
  optimisticPhaseTask,
  type ProjectTaskCreateInput,
  type ProjectTaskPatch,
  patchTask,
  reconcileTask,
  removeTask,
  reorderTasks,
} from "./lib/project-detail-task-cache.js";
import {
  type ProjectSpaceScope,
  useProjectSpaceScope,
  withProjectSpaceScope,
} from "./lib/use-project-space-scope.js";
import { projectKeys } from "./queries.js";

/**
 * Project tasks are edited on the project-detail document, so every task
 * mutation runs one `beginOptimisticUpdate` transaction against
 * `projectKeys.detail(projectId)`. The document reducers live in
 * `lib/project-detail-task-cache.ts`; the recovery policy per family is
 * documented in `docs/content/dev/optimistic-ui-mutation-inventory.md`.
 */

/** Task counts feed the project cards on the list page, and are server-derived. */
function invalidateTaskCounts(
  queryClient: ReturnType<typeof useQueryClient>
): void {
  void queryClient.invalidateQueries({
    queryKey: [...projectKeys.all, "tasks", "counts"],
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

/**
 * Entity-guarded recovery: a failure removes only this create's temporary row,
 * then invalidates so a concurrent writer's rows are recovered authoritatively.
 */
export function useCreateProjectTaskMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: (input: ProjectTaskCreateInput) => createTask(projectId, input),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) =>
            insertTask(
              current,
              optimisticPhaseTask(input, projectId, optimisticId)
            ),
        });
      return { optimisticId, transaction };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<ProjectWithPhasesAndTasks>(
          queryKey,
          (current) => removeTask(current, context.optimisticId)
        );
        void context.transaction.invalidate();
      }
      toast.error(t("tasks.createFailed"));
    },
    onSuccess: (saved, _input, context) => {
      if (!context) {
        return;
      }
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        reconcileTask(current, context.optimisticId, saved)
      );
      invalidateTaskCounts(queryClient);
    },
  });
}

/**
 * Serialized recovery: one write per task at a time, so restoring the snapshot
 * is safe. `rollback` keeps a newer value when a refetch beat the failure.
 */
export function useUpdateProjectTaskMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: ({
      taskId,
      patch,
    }: {
      taskId: string;
      patch: ProjectTaskPatch;
    }) => updateTask(projectId, taskId, patch),
    onMutate: async ({ taskId, patch }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => patchTask(current, taskId, patch),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      context?.transaction.rollback();
      toast.error(t("tasks.updateFailed"));
    },
    onSuccess: (saved: PhaseTask) => {
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        patchTask(current, saved.id, saved)
      );
      invalidateTaskCounts(queryClient);
    },
  });
}

/**
 * Portal visibility has its own endpoint, so it cannot ride the generic patch,
 * but the cache effect is the same single field.
 */
export function useSetProjectTaskVisibilityMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: ({ taskId, isPublic }: { taskId: string; isPublic: boolean }) =>
      updateTaskVisibility(projectId, taskId, isPublic),
    onMutate: async ({ taskId, isPublic }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) =>
            patchTask(current, taskId, { is_public: isPublic }),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      context?.transaction.rollback();
      toast.error(t("tasks.updateFailed"));
    },
    onSuccess: (saved: PhaseTask) => {
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        patchTask(current, saved.id, saved)
      );
    },
  });
}

export function useDeleteProjectTaskMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: (taskId: string) => deleteTask(projectId, taskId),
    onMutate: async (taskId) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => removeTask(current, taskId),
        });
      return { transaction };
    },
    onError: (_error, _taskId, context) => {
      void context?.transaction.invalidate();
      toast.error(t("tasks.deleteFailed"));
    },
    onSuccess: (_result, taskId) => {
      // A refetch can land between the optimistic removal and the commit, and
      // a realtime DELETE is not reliably delivered, so re-assert the removal
      // now that the server has confirmed it.
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        removeTask(current, taskId)
      );
      invalidateTaskCounts(queryClient);
    },
  });
}

/**
 * Overlapping recovery: a reorder writes several rows, so a partial failure can
 * leave the document holding another write's rows. Recover by refetching rather
 * than restoring a snapshot that predates it.
 */
export function useReorderProjectTasksMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: async ({
      orderedIds,
      previousIds,
    }: {
      orderedIds: readonly string[];
      phaseId: string | null;
      previousIds: readonly string[];
    }) => {
      for (const [index, taskId] of orderedIds.entries()) {
        if (previousIds[index] !== taskId) {
          await updateTask(projectId, taskId, { order_index: index });
        }
      }
    },
    onMutate: async ({ orderedIds, phaseId }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => reorderTasks(current, phaseId, orderedIds),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      void context?.transaction.invalidate();
      toast.error(t("tasks.reorderFailed"));
    },
  });
}

/**
 * Phase creates carry a temporary id like task creates, and recover the same
 * way: drop only this create's row, then invalidate for the authoritative view.
 */
export function useCreateProjectPhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: (input: ProjectPhaseCreateInput) =>
      createPhase(projectId, input),
    onMutate: async (input) => {
      const optimisticId = createOptimisticId();
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) =>
            insertPhase(
              current,
              optimisticPhase(input, projectId, optimisticId)
            ),
        });
      return { optimisticId, transaction };
    },
    onError: (_error, _input, context) => {
      if (context) {
        queryClient.setQueryData<ProjectWithPhasesAndTasks>(
          queryKey,
          (current) =>
            removePhase(current, context.optimisticId, {
              kind: "delete",
            })
        );
        void context.transaction.invalidate();
      }
      toast.error(t("phases.createFailed"));
    },
    onSuccess: (saved, _input, context) => {
      if (context) {
        queryClient.setQueryData<ProjectWithPhasesAndTasks>(
          queryKey,
          (current) => reconcilePhase(current, context.optimisticId, saved)
        );
      }
    },
  });
}

export function useUpdateProjectPhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: ({
      phaseId,
      patch,
    }: {
      phaseId: string;
      patch: ProjectPhasePatch;
    }) => updatePhase(projectId, phaseId, patch),
    onMutate: async ({ phaseId, patch }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => patchPhase(current, phaseId, patch),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      context?.transaction.rollback();
      toast.error(t("phases.updateFailed"));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        patchPhase(current, saved.id, saved)
      );
    },
  });
}

/** Portal visibility for a phase — its own endpoint, one field in the cache. */
export function useSetProjectPhaseVisibilityMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: ({
      phaseId,
      isPublic,
    }: {
      phaseId: string;
      isPublic: boolean;
    }) => updatePhaseVisibility(projectId, phaseId, isPublic),
    onMutate: async ({ phaseId, isPublic }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) =>
            patchPhase(current, phaseId, { is_public: isPublic }),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      context?.transaction.rollback();
      toast.error(t("phases.updateFailed"));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        patchPhase(current, saved.id, saved)
      );
    },
  });
}

/**
 * Deleting a phase settles its tasks first — moved or deleted, one write each —
 * then removes the phase. Several writes can half-succeed, so recovery is a
 * refetch rather than a snapshot restore.
 */
export function useDeleteProjectPhaseMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: async ({
      phaseId,
      taskIds,
      taskAction,
    }: {
      phaseId: string;
      taskAction:
        | { kind: "delete" }
        | { kind: "move"; targetPhaseId: string | null };
      taskIds: readonly string[];
    }) => {
      for (const taskId of taskIds) {
        if (taskAction.kind === "move") {
          await updateTask(projectId, taskId, {
            phase_id: taskAction.targetPhaseId,
          });
        } else {
          await deleteTask(projectId, taskId);
        }
      }
      return await deletePhase(projectId, phaseId);
    },
    onMutate: async ({ phaseId, taskAction }) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => removePhase(current, phaseId, taskAction),
        });
      return { transaction };
    },
    onError: (_error, _variables, context) => {
      void context?.transaction.invalidate();
      toast.error(t("phases.deleteFailed"));
    },
    onSuccess: (_result, { phaseId, taskAction }) => {
      // The task writes that precede the delete each trigger a realtime
      // refetch, which can restore the phase mid-sequence, and a realtime
      // DELETE on `project_phases` is not reliably delivered. Re-assert the
      // removal against the confirmed server state.
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        removePhase(current, phaseId, taskAction)
      );
      invalidateTaskCounts(queryClient);
    },
  });
}

/** Project-level field edits from the settings panel and the briefing editor. */
export function useUpdateProjectDetailMutation(projectId: string) {
  const queryClient = useQueryClient();
  const { t } = useTranslation("projects");
  const queryKey = projectKeys.detail(projectId);
  return useMutation({
    mutationFn: (patch: ProjectUpdateInput) => updateProject(projectId, patch),
    onMutate: async (patch) => {
      const transaction =
        await beginOptimisticUpdate<ProjectWithPhasesAndTasks>(queryClient, {
          queryKey,
          update: (current) => patchProject(current, patch),
        });
      return { transaction };
    },
    onError: (_error, _patch, context) => {
      context?.transaction.rollback();
      toast.error(t("detail.saveFailed"));
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<ProjectWithPhasesAndTasks>(queryKey, (current) =>
        patchProject(current, saved)
      );
      void queryClient.invalidateQueries({
        queryKey: [...projectKeys.all, "list"],
      });
    },
  });
}
