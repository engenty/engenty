/**
 * useTimeEntryOperations — clean save/delete/move handlers for the
 * time-tracking grid. No shared hoursInput map; the cell owns its own state.
 *
 * This hook only manages:
 *  - create / update / delete / move API calls (with a per-entry lock to
 *    prevent true concurrent DB requests for the same cell)
 *  - move-mode UI state (cross-cell, so it must live here)
 */
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  createTimeEntry,
  deleteTimeEntry,
  deleteTimesheetRow,
  getPhasesCatalog,
  getTasksCatalog,
  moveTimeEntry,
  type Option,
  type TimeEntry,
  type TrackingRow,
  updateTimeEntry,
} from "../api.js";
import { isLinkableEntityId } from "../components/tracking-entity-link.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textOrNull(value: string | null | undefined) {
  const t = value?.trim();
  return t || null;
}

/**
 * Build the identity fields for a new DB row.
 *
 * Rule: use the row's real IDs whenever present; only fall back to
 * manual_* title fields when the row has no linked ID for that level.
 *
 * This ensures:
 *  - Task-module rows (task_id set) → always saved with task_id, never as manual
 *  - Project/phase rows with real IDs → saved with those IDs
 *  - Fully manual rows (no IDs at any level) → saved with manual_* titles
 */
export function buildEntryIdentity(row: TrackingRow) {
  // Use IDs directly from the row — no conditional type-checking that could
  // accidentally drop a real task_id or project_id. Grouping sentinels like
  // "standalone_tasks" are not real entity ids and would violate the
  // timesheet_rows FKs, so only UUID-shaped ids pass through.
  const project_id = isLinkableEntityId(row.project_id) ? row.project_id : null;
  const phase_id = isLinkableEntityId(row.phase_id) ? row.phase_id : null;
  const task_id = isLinkableEntityId(row.task_id) ? row.task_id : null;

  if (project_id || phase_id || task_id) {
    // Linked row — save with real IDs, no manual titles.
    return {
      manual_phase_title: null,
      manual_project_title: null,
      manual_task_title: null,
      phase_id,
      project_id,
      task_id,
    };
  }

  // Fully manual row — derive titles from the display labels.
  return {
    manual_phase_title:
      row.type === "phase"
        ? textOrNull(row.phase_title ?? row.project_title)
        : null,
    manual_project_title:
      row.type === "project" || row.type === "phase"
        ? textOrNull(row.project_title)
        : null,
    manual_task_title:
      row.type === "task"
        ? textOrNull(row.task_title ?? row.project_title)
        : null,
    phase_id: null,
    project_id: null,
    task_id: null,
  };
}

function sameNullable(
  left: string | null | undefined,
  right: string | null | undefined
) {
  return (left ?? null) === (right ?? null);
}

/**
 * THE canonical UI-side entry→row matcher.
 *
 * Mirrors entryMatchesRow in src/dal/time-entry-mapper.ts — both must be kept
 * in sync. There must be no other copies of this logic in the UI codebase.
 *
 * Matching rules per row type:
 *   task  → linked: entry.task_id === row.task_id
 *            manual: no task_id, manual_task_title matches
 *   phase → linked: entry.phase_id === row.phase_id, no task
 *            manual: no phase/task_id, manual_phase_title matches
 *   project → linked: entry.project_id matches, no phase/task
 *              manual: all IDs null, manual_project_title matches
 */
export function entryMatchesRow(entry: TimeEntry, row: TrackingRow) {
  return entry.timesheet_row_id === row.id;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTimeEntryOperations(
  selectedUser: string,
  currentUser: { id: string } | null,
  showUserSelect: boolean,
  projectSelectionEnabled: boolean,
  refetchTimeEntries: () => Promise<void>
) {
  // Move-mode state (shared across cells because only one entry moves at a time).
  const [moveMode, setMoveMode] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState(new Date());
  const [moveProject, setMoveProject] = useState("");
  const [movePhase, setMovePhase] = useState("");
  const [moveTask, setMoveTask] = useState("");
  const [moveDiscipline, setMoveDiscipline] = useState("");
  const [moveUser, setMoveUser] = useState("");
  const [movePhases, setMovePhases] = useState<Option[]>([]);
  const [moveTasks, setMoveTasks] = useState<Option[]>([]);
  const [moveProjectComboOpen, setMoveProjectComboOpen] = useState(false);

  useEffect(() => {
    if (!(projectSelectionEnabled && moveProject)) {
      return;
    }
    getPhasesCatalog(moveProject)
      .then(setMovePhases)
      .catch(() => setMovePhases([]));
    setMovePhase("");
    setMoveTask("");
  }, [moveProject, projectSelectionEnabled]);

  useEffect(() => {
    if (!(projectSelectionEnabled && movePhase) || movePhase === "general") {
      setMoveTasks([]);
      return;
    }
    getTasksCatalog(movePhase)
      .then(setMoveTasks)
      .catch(() => setMoveTasks([]));
    setMoveTask("");
  }, [movePhase, projectSelectionEnabled]);

  // Per-entry in-flight lock — prevents two concurrent HTTP requests for the
  // exact same cell (e.g. Enter + blur arriving milliseconds apart).
  const savingEntries = useRef(new Set<string>());

  // -----------------------------------------------------------------------
  // Lookup helper — find the saved entry for a (row, date) pair
  // -----------------------------------------------------------------------
  const getEntryForRowAndDate = (
    row: TrackingRow,
    date: Date,
    timeEntries: TimeEntry[]
  ) =>
    timeEntries.find((entry) => {
      const matchesDate =
        parseISO(entry.date).toDateString() === date.toDateString();
      return matchesDate && entryMatchesRow(entry, row);
    });

  // -----------------------------------------------------------------------
  // Save — the cell calls this with already-resolved hours/notes/discipline
  // -----------------------------------------------------------------------
  const handleSaveEntry = async (
    row: TrackingRow,
    date: Date,
    entry: TimeEntry | undefined,
    hours: number,
    notes: string | null,
    discipline: string | null
  ) => {
    // Stable lock key: row identity + date (never entry.id, which may not
    // exist yet for new entries and changes after the first create).
    const dateStr = format(date, "yyyy-MM-dd");
    const lockKey = `${row.id}::${dateStr}`;
    if (savingEntries.current.has(lockKey)) {
      return;
    }

    const userId = selectedUser || currentUser?.id;
    if (!userId) {
      return;
    }

    savingEntries.current.add(lockKey);
    try {
      if (entry) {
        await updateTimeEntry(entry.id, { hours, notes, discipline });
      } else {
        await createTimeEntry({
          user_id: userId,
          date: dateStr,
          hours,
          notes,
          discipline,
          ...buildEntryIdentity(row),
        });
      }
      await refetchTimeEntries();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save time entry"
      );
    } finally {
      savingEntries.current.delete(lockKey);
    }
  };

  // -----------------------------------------------------------------------
  // Delete
  // -----------------------------------------------------------------------
  const handleDeleteEntry = async (entryId: string) => {
    await deleteTimeEntry(entryId);
    await refetchTimeEntries();
  };

  // -----------------------------------------------------------------------
  // Move
  // -----------------------------------------------------------------------
  const handleMoveEntry = async (entry: TimeEntry) => {
    await moveTimeEntry(entry.id, {
      date: format(moveDate, "yyyy-MM-dd"),
      project_id: projectSelectionEnabled ? moveProject || null : null,
      phase_id:
        projectSelectionEnabled && movePhase && movePhase !== "general"
          ? movePhase
          : null,
      task_id: projectSelectionEnabled ? moveTask || null : null,
      discipline:
        moveDiscipline && moveDiscipline !== "NONE" ? moveDiscipline : null,
      user_id: showUserSelect ? moveUser || entry.user_id : undefined,
      manual_project_title: projectSelectionEnabled
        ? null
        : (entry.manual_project_title ?? "Manual project"),
      manual_phase_title: projectSelectionEnabled
        ? null
        : (entry.manual_phase_title ?? null),
      manual_task_title: projectSelectionEnabled
        ? null
        : (entry.manual_task_title ?? null),
    });
    await refetchTimeEntries();
    setMoveMode(null);
  };

  const openMoveMode = (entry: TimeEntry) => {
    setMoveMode(entry.id);
    setMoveDate(parseISO(entry.date));
    setMoveProject(entry.project_id || "");
    setMovePhase(entry.phase_id || "");
    setMoveTask(entry.task_id || "");
    setMoveDiscipline(entry.discipline || "NONE");
    setMoveUser(entry.user_id);
  };

  // -----------------------------------------------------------------------
  // Delete Row
  // -----------------------------------------------------------------------
  const handleDeleteRow = async (rowId: string) => {
    // Only call deleteTimesheetRow if it is a persisted DB row (which has a UUID/stable ID, not a temporary task-taskId ID)
    if (!rowId.startsWith("task-")) {
      try {
        await deleteTimesheetRow(rowId);
        await refetchTimeEntries();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete row"
        );
      }
    }
  };

  return {
    // Move state
    moveMode,
    setMoveMode,
    moveDate,
    setMoveDate,
    moveProject,
    setMoveProject,
    movePhase,
    setMovePhase,
    moveTask,
    setMoveTask,
    moveDiscipline,
    setMoveDiscipline,
    moveUser,
    setMoveUser,
    movePhases,
    moveTasks,
    moveProjectComboOpen,
    setMoveProjectComboOpen,
    // Handlers
    getEntryForRowAndDate,
    handleSaveEntry,
    handleDeleteEntry,
    handleMoveEntry,
    openMoveMode,
    handleDeleteRow,
  };
}
