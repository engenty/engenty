import { format, startOfWeek } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  addTrackingRow,
  ensureTaskCollaborator,
  getAllTasksCatalog,
  getPhasesCatalog,
  getProjectGeneralTasksCatalog,
  getTasksCatalog,
  type Option,
  type ProjectOption,
} from "../api.js";

export type TrackingTargetMode = "task" | "project" | "custom";

export function useAddTrackingRow(
  currentWeek: Date,
  selectedUser: string,
  currentUser: { id: string } | null,
  allProjects: ProjectOption[],
  projectsAvailable: boolean,
  tasksAvailable: boolean,
  refetchTrackingRows: () => Promise<void>,
  refetchTimeEntries: () => Promise<void>
) {
  const defaultMode = useMemo((): TrackingTargetMode => {
    if (tasksAvailable) {
      return "task";
    }
    if (projectsAvailable) {
      return "project";
    }
    return "custom";
  }, [projectsAvailable, tasksAvailable]);

  const [trackingMode, setTrackingMode] =
    useState<TrackingTargetMode>(defaultMode);
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [availablePhases, setAvailablePhases] = useState<Option[]>([]);
  const [selectedPhase, setSelectedPhase] = useState("");
  const [availableTasks, setAvailableTasks] = useState<Option[]>([]);
  const [allTasks, setAllTasks] = useState<Option[]>([]);
  const [selectedTask, setSelectedTask] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [manualProjectTitle, setManualProjectTitle] = useState("");
  const [manualPhaseTitle, setManualPhaseTitle] = useState("");
  const [manualTaskTitle, setManualTaskTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const userId = selectedUser || currentUser?.id || "";

  useEffect(() => {
    setTrackingMode(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    if (!(projectsAvailable && trackingMode === "project")) {
      return;
    }
    if (selectedProject) {
      getPhasesCatalog(selectedProject)
        .then(setAvailablePhases)
        .catch(() => setAvailablePhases([]));
      setSelectedPhase("");
      setSelectedTask("");
    }
  }, [selectedProject, projectsAvailable, trackingMode]);

  useEffect(() => {
    if (!(projectsAvailable && trackingMode === "project")) {
      return;
    }
    if (selectedPhase && selectedPhase !== "general") {
      getTasksCatalog(selectedPhase)
        .then(setAvailableTasks)
        .catch(() => setAvailableTasks([]));
      setSelectedTask("");
    } else if (selectedPhase === "general" && selectedProject) {
      getProjectGeneralTasksCatalog(selectedProject)
        .then(setAvailableTasks)
        .catch(() => setAvailableTasks([]));
      setSelectedTask("");
    } else {
      setAvailableTasks([]);
      setSelectedTask("");
    }
  }, [selectedPhase, selectedProject, projectsAvailable, trackingMode]);

  useEffect(() => {
    if (!(tasksAvailable && trackingMode === "task")) {
      setAllTasks([]);
      return;
    }
    getAllTasksCatalog()
      .then(setAllTasks)
      .catch(() => setAllTasks([]));
    setSelectedTask("");
  }, [tasksAvailable, trackingMode]);

  const reset = () => {
    setTrackingMode(defaultMode);
    setSelectedProject("");
    setSelectedPhase("");
    setSelectedTask("");
    setSelectedDiscipline("");
    setAvailablePhases([]);
    setAvailableTasks([]);
    setAllTasks([]);
    setManualProjectTitle("");
    setManualPhaseTitle("");
    setManualTaskTitle("");
    setAddError(null);
  };

  const handleAddRow = async () => {
    if (!userId) {
      setAddError("No user context available yet. Please try again.");
      return false;
    }

    if (trackingMode === "task") {
      if (!selectedTask) {
        setAddError("Please select a task.");
        return false;
      }
    } else if (trackingMode === "project") {
      if (!selectedProject) {
        setAddError("Please select a project.");
        return false;
      }
    } else if (!(manualProjectTitle.trim() || manualTaskTitle.trim())) {
      setAddError("Add a project or task title.");
      return false;
    }

    setAddError(null);
    try {
      await addTrackingRow({
        user_id: userId,
        date: format(weekStart, "yyyy-MM-dd"),
        discipline: selectedDiscipline || null,
        project_id: trackingMode === "project" ? selectedProject || null : null,
        phase_id:
          trackingMode === "project" &&
          selectedPhase &&
          selectedPhase !== "general"
            ? selectedPhase
            : null,
        task_id:
          trackingMode === "task"
            ? selectedTask || null
            : trackingMode === "project"
              ? selectedTask || null
              : null,
        manual_project_title:
          trackingMode === "custom" ? manualProjectTitle.trim() || null : null,
        manual_phase_title:
          trackingMode === "custom" ? manualPhaseTitle.trim() || null : null,
        manual_task_title:
          trackingMode === "custom" ? manualTaskTitle.trim() || null : null,
      });

      if (trackingMode === "task" && selectedTask && userId) {
        ensureTaskCollaborator(selectedTask, userId).catch(() => {});
      }

      await refetchTrackingRows();
      await refetchTimeEntries();
      setAddRowOpen(false);
      reset();
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add tracking row.";
      setAddError(message);
      return false;
    }
  };

  return {
    addRowOpen,
    setAddRowOpen,
    trackingMode,
    setTrackingMode,
    selectedProject,
    setSelectedProject,
    availablePhases,
    selectedPhase,
    setSelectedPhase,
    availableTasks,
    allTasks,
    selectedTask,
    setSelectedTask,
    selectedDiscipline,
    setSelectedDiscipline,
    manualProjectTitle,
    setManualProjectTitle,
    manualPhaseTitle,
    setManualPhaseTitle,
    manualTaskTitle,
    setManualTaskTitle,
    addError,
    allProjects,
    handleAddRow,
    projectsAvailable,
    tasksAvailable,
  };
}
