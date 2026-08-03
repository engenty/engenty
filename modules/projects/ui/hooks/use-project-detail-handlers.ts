import type { DragEndEvent } from "@dnd-kit/core";
import { useCallback, useState } from "react";
import {
  createPhase,
  createTask,
  deleteTask,
  type PhaseTask,
  type ProjectPhase,
  type ProjectWithPhasesAndTasks,
  updatePhase,
  updatePhaseVisibility,
  updateProject,
  updateTask,
  updateTaskVisibility,
} from "../api.js";
import type { ProjectSettingsValues } from "../components/project-settings-panel.js";

export interface UseProjectDetailHandlersParams {
  addTaskPhaseId: string | null;
  editingPhase: ProjectPhase | null;
  editingTask: PhaseTask | null;
  id: string | undefined;
  loadProject: () => Promise<void>;
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
  loadProject,
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

  const handleDragStart = useCallback(
    (event: { active: { id: string } }) => {
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

        if (oldIndex !== newIndex) {
          const start = Math.min(oldIndex, newIndex);
          const end = Math.max(oldIndex, newIndex);

          for (let i = start; i <= end; i++) {
            const task = taskList[i];
            let newOrderIndex = i;

            if (i === oldIndex) {
              newOrderIndex = newIndex;
            } else if (oldIndex < newIndex && i > oldIndex && i <= newIndex) {
              newOrderIndex = i - 1;
            } else if (oldIndex > newIndex && i >= newIndex && i < oldIndex) {
              newOrderIndex = i + 1;
            }

            await updateTask(id, task.id, { order_index: newOrderIndex });
          }
        }
      } else {
        const targetList = targetPhaseId
          ? project.phases.find((p) => p.id === targetPhaseId)?.tasks || []
          : project.general_tasks;
        await updateTask(id, activeId, {
          phase_id: targetPhaseId,
          order_index: targetList.length,
        });
      }
      await loadProject();
    },
    [id, project, loadProject]
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
        await updatePhase(id, editingPhase.id, data);
      } else {
        await createPhase(id, {
          ...data,
          order_index: project?.phases?.length ?? 0,
        });
      }
      setPhaseFormOpen(false);
      setEditingPhase(null);
      await loadProject();
    },
    [id, editingPhase, project?.phases?.length, loadProject]
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
        await updateTask(id, editingTask.id, data);
      } else {
        await createTask(id, {
          ...data,
          phase_id: data.phase_id ?? addTaskPhaseId ?? null,
          discipline: data.discipline ?? null,
          hours: data.hours ?? null,
          team_member_ids: data.team_member_ids ?? [],
          order_index: 0,
        });
      }
      setTaskFormOpen(false);
      setEditingTask(null);
      setAddTaskPhaseId(null);
      await loadProject();
    },
    [id, editingTask, addTaskPhaseId, loadProject]
  );

  const handleTaskStatusChange = useCallback(
    async (taskId: string, status: string) => {
      if (!id) {
        return;
      }
      await updateTask(id, taskId, { status });
      await loadProject();
    },
    [id, loadProject]
  );

  const handleTaskDelete = useCallback(
    async (taskId: string) => {
      if (!id) {
        return;
      }
      await deleteTask(id, taskId);
      await loadProject();
    },
    [id, loadProject]
  );

  const handlePhaseVisibilityToggle = useCallback(
    async (phaseId: string, is_public: boolean) => {
      if (!id) {
        return;
      }
      await updatePhaseVisibility(id, phaseId, is_public);
      await loadProject();
    },
    [id, loadProject]
  );

  const handleTaskVisibilityToggle = useCallback(
    async (taskId: string, is_public: boolean) => {
      if (!id) {
        return;
      }
      await updateTaskVisibility(id, taskId, is_public);
      await loadProject();
    },
    [id, loadProject]
  );

  const handleProjectSettingsSave = useCallback(
    async (values: ProjectSettingsValues) => {
      if (!id) {
        return;
      }
      await updateProject(id, values);
      await loadProject();
    },
    [id, loadProject]
  );

  const handleBriefingSave = useCallback(
    async (briefing: string | null) => {
      if (!id) {
        return;
      }
      await updateProject(id, { briefing: briefing ?? null });
      await loadProject();
    },
    [id, loadProject]
  );

  return {
    activeTask,
    handleBriefingSave,
    handleDragEnd,
    handleDragStart,
    handlePhaseSubmit,
    handlePhaseVisibilityToggle,
    handleProjectSettingsSave,
    handleTaskDelete,
    handleTaskStatusChange,
    handleTaskSubmit,
    handleTaskVisibilityToggle,
  };
}
