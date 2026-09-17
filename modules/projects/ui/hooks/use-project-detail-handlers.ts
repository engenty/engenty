import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useState } from "react";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectWithPhasesAndTasks,
} from "../api.js";
import type { PhaseDeleteConfirm } from "../components/phase-delete-dialog.js";
import type { ProjectSettingsValues } from "../components/project-settings-panel.js";
import {
  useCreateProjectPhaseMutation,
  useCreateProjectTaskMutation,
  useDeleteProjectPhaseMutation,
  useDeleteProjectTaskMutation,
  useReorderProjectTasksMutation,
  useSetProjectPhaseVisibilityMutation,
  useSetProjectTaskVisibilityMutation,
  useUpdateProjectDetailMutation,
  useUpdateProjectPhaseMutation,
  useUpdateProjectTaskMutation,
} from "../optimistic-mutations.js";

export interface UseProjectDetailHandlersParams {
  addTaskPhaseId: string | null;
  editingPhase: ProjectPhase | null;
  editingTask: PhaseTask | null;
  id: string | undefined;
  project: ProjectWithPhasesAndTasks | null;
  setAddTaskPhaseId: (id: string | null) => void;
  setEditingPhase: (phase: ProjectPhase | null) => void;
  setEditingTask: (task: PhaseTask | null) => void;
  setPhaseFormOpen: (open: boolean) => void;
  setTaskFormOpen: (open: boolean) => void;
}

export function useProjectDetailHandlers({
  id,
  project,
  editingPhase,
  editingTask,
  addTaskPhaseId,
  setPhaseFormOpen,
  setEditingPhase,
  setTaskFormOpen,
  setEditingTask,
  setAddTaskPhaseId,
}: UseProjectDetailHandlersParams) {
  const [activeTask, setActiveTask] = useState<PhaseTask | null>(null);
  // Every write on this page patches the project-detail document in place.
  const projectId = id ?? "";
  const createTaskMutation = useCreateProjectTaskMutation(projectId);
  const updateTaskMutation = useUpdateProjectTaskMutation(projectId);
  const deleteTaskMutation = useDeleteProjectTaskMutation(projectId);
  const reorderTasksMutation = useReorderProjectTasksMutation(projectId);
  const taskVisibilityMutation = useSetProjectTaskVisibilityMutation(projectId);
  const createPhaseMutation = useCreateProjectPhaseMutation(projectId);
  const updatePhaseMutation = useUpdateProjectPhaseMutation(projectId);
  const deletePhaseMutation = useDeleteProjectPhaseMutation(projectId);
  const phaseVisibilityMutation =
    useSetProjectPhaseVisibilityMutation(projectId);
  const updateProjectMutation = useUpdateProjectDetailMutation(projectId);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = event.active.id as string;
      let task = project?.general_tasks.find((t) => t.id === activeId);
      if (!task) {
        for (const phase of project?.phases || []) {
          task = phase.tasks.find((t) => t.id === activeId);
          if (task) {
            break;
          }
        }
      }
      setActiveTask(task || null);
    },
    [project]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);
      const { active, over } = event;
      if (!(over && project && id)) {
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      let sourceTask: PhaseTask | undefined;
      let sourcePhaseId: string | null = null;

      sourceTask = project.general_tasks.find((t) => t.id === activeId);
      if (!sourceTask) {
        for (const phase of project.phases) {
          const task = phase.tasks.find((t) => t.id === activeId);
          if (task) {
            sourceTask = task;
            sourcePhaseId = phase.id;
            break;
          }
        }
      }

      if (!sourceTask) {
        return;
      }

      let targetPhaseId: string | null = null;
      if (overId.startsWith("phase-")) {
        targetPhaseId = overId.replace("phase-", "");
      } else if (overId === "general-tasks") {
        targetPhaseId = null;
      } else {
        const targetTask = project.general_tasks.find((t) => t.id === overId);
        if (targetTask) {
          targetPhaseId = null;
        } else {
          for (const phase of project.phases) {
            if (phase.tasks.find((t) => t.id === overId)) {
              targetPhaseId = phase.id;
              break;
            }
          }
        }
      }

      if (targetPhaseId === sourcePhaseId) {
        const taskList = targetPhaseId
          ? project.phases.find((p) => p.id === targetPhaseId)?.tasks || []
          : project.general_tasks;
        const oldIndex = taskList.findIndex((t) => t.id === activeId);
        const newIndex = taskList.findIndex((t) => t.id === overId);

        // Dropping on the phase container itself has no position to move to.
        if (newIndex >= 0 && oldIndex !== newIndex) {
          const previousIds = taskList.map((t) => t.id);
          reorderTasksMutation.mutate({
            orderedIds: arrayMove(previousIds, oldIndex, newIndex),
            phaseId: targetPhaseId,
            previousIds,
          });
        }
      } else {
        const targetList = targetPhaseId
          ? project.phases.find((p) => p.id === targetPhaseId)?.tasks || []
          : project.general_tasks;
        updateTaskMutation.mutate({
          patch: {
            order_index: targetList.length,
            phase_id: targetPhaseId,
          },
          taskId: activeId,
        });
      }
    },
    [id, project, reorderTasksMutation, updateTaskMutation]
  );

  const handlePhaseSubmit = useCallback(
    async (data: {
      title: string;
      start_date: string | null;
      end_date: string | null;
      is_main: boolean;
      is_public: boolean;
    }) => {
      if (!id) {
        return;
      }
      if (editingPhase) {
        updatePhaseMutation.mutate({ patch: data, phaseId: editingPhase.id });
      } else {
        createPhaseMutation.mutate({
          ...data,
          order_index: project?.phases?.length ?? 0,
        });
      }
      setPhaseFormOpen(false);
      setEditingPhase(null);
    },
    [
      id,
      editingPhase,
      project?.phases?.length,
      createPhaseMutation,
      updatePhaseMutation,
      setPhaseFormOpen,
      setEditingPhase,
    ]
  );

  const handlePhaseDelete = useCallback(
    ({ taskAction, targetPhaseId }: PhaseDeleteConfirm) => {
      if (!(id && editingPhase)) {
        return;
      }
      const phaseTasks =
        project?.phases.find((p) => p.id === editingPhase.id)?.tasks ?? [];
      deletePhaseMutation.mutate({
        phaseId: editingPhase.id,
        taskAction:
          taskAction === "move"
            ? { kind: "move", targetPhaseId }
            : { kind: "delete" },
        taskIds: phaseTasks.map((task) => task.id),
      });
      setPhaseFormOpen(false);
      setEditingPhase(null);
    },
    [
      id,
      editingPhase,
      project?.phases,
      deletePhaseMutation,
      setPhaseFormOpen,
      setEditingPhase,
    ]
  );

  const handleTaskSubmit = useCallback(
    async (data: {
      title: string;
      content: string | null;
      status: string;
      is_public: boolean;
      phase_id?: string | null;
      discipline?: string | null;
      hours?: number | null;
      team_member_ids?: string[];
    }) => {
      if (!id) {
        return;
      }
      if (editingTask) {
        updateTaskMutation.mutate({ patch: data, taskId: editingTask.id });
      } else {
        createTaskMutation.mutate({
          ...data,
          discipline: data.discipline ?? null,
          hours: data.hours ?? null,
          order_index: 0,
          phase_id: data.phase_id ?? addTaskPhaseId ?? null,
          team_member_ids: data.team_member_ids ?? [],
        });
      }
      setTaskFormOpen(false);
      setEditingTask(null);
      setAddTaskPhaseId(null);
    },
    [
      id,
      editingTask,
      addTaskPhaseId,
      createTaskMutation,
      updateTaskMutation,
      setTaskFormOpen,
      setEditingTask,
      setAddTaskPhaseId,
    ]
  );

  const handleTaskStatusChange = useCallback(
    (taskId: string, status: string) => {
      if (!id) {
        return;
      }
      updateTaskMutation.mutate({ patch: { status }, taskId });
    },
    [id, updateTaskMutation]
  );

  const handleTaskDelete = useCallback(
    (taskId: string) => {
      if (!id) {
        return;
      }
      deleteTaskMutation.mutate(taskId);
    },
    [id, deleteTaskMutation]
  );

  const handlePhaseVisibilityToggle = useCallback(
    (phaseId: string, is_public: boolean) => {
      if (!id) {
        return;
      }
      phaseVisibilityMutation.mutate({ isPublic: is_public, phaseId });
    },
    [id, phaseVisibilityMutation]
  );

  const handleTaskVisibilityToggle = useCallback(
    (taskId: string, is_public: boolean) => {
      if (!id) {
        return;
      }
      taskVisibilityMutation.mutate({ isPublic: is_public, taskId });
    },
    [id, taskVisibilityMutation]
  );

  const handleProjectSettingsSave = useCallback(
    (values: ProjectSettingsValues) => {
      if (!id) {
        return;
      }
      updateProjectMutation.mutate(values);
    },
    [id, updateProjectMutation]
  );

  const handleBriefingSave = useCallback(
    (briefing: string | null) => {
      if (!id) {
        return;
      }
      updateProjectMutation.mutate({ briefing: briefing ?? null });
    },
    [id, updateProjectMutation]
  );

  return {
    activeTask,
    handleBriefingSave,
    handleDragEnd,
    handleDragStart,
    handlePhaseSubmit,
    handlePhaseDelete,
    handlePhaseVisibilityToggle,
    handleProjectSettingsSave,
    handleTaskDelete,
    handleTaskStatusChange,
    handleTaskSubmit,
    handleTaskVisibilityToggle,
  };
}
