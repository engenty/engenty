import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { parseISO } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  getAllTasksCatalog,
  getPhasesCatalog,
  getProjectGeneralTasksCatalog,
  getTasksCatalog,
} from "../../api.js";
import { buildEntryIdentity } from "../../hooks/use-time-entry-operations.js";
import type {
  Discipline,
  Option,
  ProjectOption,
  TimeEntry,
  TrackingRow,
} from "../types.js";
import {
  formatDuration,
  MIN_DURATION,
  minutesToTime,
  projectColor,
  projectColorKey,
  timeToMinutes,
} from "./calendar-utils.js";

export interface EntryIdentity {
  manual_phase_title: string | null;
  manual_project_title: string | null;
  manual_task_title: string | null;
  phase_id: string | null;
  project_id: string | null;
  task_id: string | null;
}

export interface EntryDialogDraft {
  date: string;
  durationMin: number;
  /** Existing entry when editing; absent when creating. */
  entry?: TimeEntry;
  startMin: number | null;
}

export interface EntryDialogResult {
  date: string;
  discipline: string | null;
  hours: number;
  /** null = keep the entry's current target (edit mode only). */
  identity: EntryIdentity | null;
  notes: string | null;
  start_time: string | null;
  /** Set when a task target was picked, for ensureTaskCollaborator. */
  taskId: string | null;
}

type TargetKind = "row" | "task" | "project" | "custom";

interface CalendarEntryDialogProps {
  allProjects: ProjectOption[];
  disciplines: Discipline[];
  draft: EntryDialogDraft | null;
  onDelete?: (entry: TimeEntry) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (result: EntryDialogResult) => Promise<void>;
  open: boolean;
  projectsAvailable: boolean;
  tasksAvailable: boolean;
  timeEntries: TimeEntry[];
  trackingRows: TrackingRow[];
}

function ModeChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ColorDot({ colorKey }: { colorKey: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: projectColor(colorKey) }}
    />
  );
}

function rowLabel(row: TrackingRow) {
  if (row.type === "task" && row.task_title) {
    return `${row.project_title} · ${row.task_title}`;
  }
  if (row.type === "phase" && row.phase_title) {
    return `${row.project_title} · ${row.phase_title}`;
  }
  return row.project_title;
}

export function CalendarEntryDialog({
  allProjects,
  disciplines,
  draft,
  onDelete,
  onOpenChange,
  onSubmit,
  open,
  projectsAvailable,
  tasksAvailable,
  timeEntries,
  trackingRows,
}: CalendarEntryDialogProps) {
  const { t, i18n } = useTranslation("time-tracking");
  const isEdit = Boolean(draft?.entry);

  // --- time / value state ---------------------------------------------------
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState<string>("");
  const [durationMin, setDurationMin] = useState(60);
  const [notes, setNotes] = useState("");
  const [discipline, setDiscipline] = useState("");

  // --- target state ----------------------------------------------------------
  const [kind, setKind] = useState<TargetKind>("row");
  const [rowId, setRowId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [allTasks, setAllTasks] = useState<Option[]>([]);
  const [projectId, setProjectId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [projectTaskId, setProjectTaskId] = useState("");
  const [phases, setPhases] = useState<Option[]>([]);
  const [projectTasks, setProjectTasks] = useState<Option[]>([]);
  const [manualProject, setManualProject] = useState("");
  const [manualPhase, setManualPhase] = useState("");
  const [manualTask, setManualTask] = useState("");

  // --- popover / ui state ----------------------------------------------------
  const [rowPickerOpen, setRowPickerOpen] = useState(false);
  const [taskPickerOpen, setTaskPickerOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [projectTaskOpen, setProjectTaskOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rows ordered by most recent use, so prefill matches "previous entry".
  const recentRows = useMemo(() => {
    const lastUsed = new Map<string, string>();
    for (const entry of timeEntries) {
      const prev = lastUsed.get(entry.timesheet_row_id);
      if (!prev || entry.date > prev) {
        lastUsed.set(entry.timesheet_row_id, entry.date);
      }
    }
    return [...trackingRows].sort((a, b) => {
      const usedA = lastUsed.get(a.id) ?? "";
      const usedB = lastUsed.get(b.id) ?? "";
      if (usedA !== usedB) {
        return usedB.localeCompare(usedA);
      }
      return rowLabel(a).localeCompare(rowLabel(b));
    });
  }, [trackingRows, timeEntries]);

  const fallbackKind: TargetKind = tasksAvailable
    ? "task"
    : projectsAvailable
      ? "project"
      : "custom";

  // Initialize state whenever the dialog opens with a new draft.
  useEffect(() => {
    if (!(open && draft)) {
      return;
    }
    setDate(draft.date);
    setStartTime(draft.startMin == null ? "" : minutesToTime(draft.startMin));
    setDurationMin(Math.max(MIN_DURATION, draft.durationMin));
    setNotes(draft.entry?.notes ?? "");
    setDiscipline(draft.entry?.discipline ?? "");
    setTaskId("");
    setProjectId("");
    setPhaseId("");
    setProjectTaskId("");
    setManualProject("");
    setManualPhase("");
    setManualTask("");
    setError(null);
    setSaving(false);

    const preferredRowId = draft.entry
      ? draft.entry.timesheet_row_id
      : (recentRows[0]?.id ?? "");
    const preferredRow = recentRows.find((row) => row.id === preferredRowId);
    if (preferredRow) {
      setKind("row");
      setRowId(preferredRow.id);
    } else {
      setKind(fallbackKind);
      setRowId("");
    }
    // recentRows is derived and stable enough per open; deliberately keyed on open/draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  // Lazy catalogs, mirroring useAddTrackingRow.
  useEffect(() => {
    if (!(open && kind === "task" && tasksAvailable)) {
      return;
    }
    getAllTasksCatalog()
      .then(setAllTasks)
      .catch(() => setAllTasks([]));
  }, [open, kind, tasksAvailable]);

  useEffect(() => {
    if (!(open && kind === "project" && projectId)) {
      setPhases([]);
      return;
    }
    getPhasesCatalog(projectId)
      .then(setPhases)
      .catch(() => setPhases([]));
  }, [open, kind, projectId]);

  useEffect(() => {
    if (!(open && kind === "project" && projectId)) {
      setProjectTasks([]);
      return;
    }
    if (phaseId && phaseId !== "general") {
      getTasksCatalog(phaseId)
        .then(setProjectTasks)
        .catch(() => setProjectTasks([]));
    } else if (phaseId === "general") {
      getProjectGeneralTasksCatalog(projectId)
        .then(setProjectTasks)
        .catch(() => setProjectTasks([]));
    } else {
      setProjectTasks([]);
    }
  }, [open, kind, projectId, phaseId]);

  const selectedRow = trackingRows.find((row) => row.id === rowId);

  const startMin = timeToMinutes(startTime || null);
  const endMin =
    startMin == null ? null : Math.min(24 * 60, startMin + durationMin);
  const hours = durationMin / 60;

  const identity: EntryIdentity | null = useMemo(() => {
    if (kind === "row") {
      if (!selectedRow) {
        return null;
      }
      if (isEdit && draft?.entry?.timesheet_row_id === selectedRow.id) {
        // Unchanged target — let the caller skip the move.
        return null;
      }
      return buildEntryIdentity(selectedRow);
    }
    if (kind === "task") {
      return taskId
        ? {
            manual_phase_title: null,
            manual_project_title: null,
            manual_task_title: null,
            phase_id: null,
            project_id: null,
            task_id: taskId,
          }
        : null;
    }
    if (kind === "project") {
      return projectId
        ? {
            manual_phase_title: null,
            manual_project_title: null,
            manual_task_title: null,
            phase_id: phaseId && phaseId !== "general" ? phaseId : null,
            project_id: projectId,
            task_id: projectTaskId || null,
          }
        : null;
    }
    const project = manualProject.trim();
    const phase = manualPhase.trim();
    const task = manualTask.trim();
    if (!(project || task)) {
      return null;
    }
    return {
      manual_phase_title: phase || null,
      manual_project_title: project || null,
      manual_task_title: task || null,
      phase_id: null,
      project_id: null,
      task_id: null,
    };
  }, [
    kind,
    selectedRow,
    isEdit,
    draft,
    taskId,
    projectId,
    phaseId,
    projectTaskId,
    manualProject,
    manualPhase,
    manualTask,
  ]);

  const keepsExistingTarget =
    isEdit && kind === "row" && draft?.entry?.timesheet_row_id === rowId;
  const hasTarget = keepsExistingTarget || identity !== null;

  const canSubmit = hasTarget && durationMin >= MIN_DURATION && Boolean(date);

  const dateLabel = date
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "long",
      }).format(parseISO(date))
    : "";

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        date,
        discipline: discipline || null,
        hours,
        identity,
        notes: notes.trim() || null,
        start_time: startMin == null ? null : minutesToTime(startMin),
        taskId:
          kind === "task"
            ? taskId || null
            : kind === "project"
              ? projectTaskId || null
              : kind === "row" && selectedRow?.task_id
                ? selectedRow.task_id
                : null,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("calendar.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!(draft?.entry && onDelete)) {
      return;
    }
    setSaving(true);
    try {
      await onDelete(draft.entry);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("calendar.saveFailed"));
      setSaving(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isEdit ? t("calendar.editEntry") : t("calendar.newEntry")}
          </DialogTitle>
        </DialogHeader>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b px-5 py-3.5 pr-12">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">
            {isEdit ? t("calendar.editEntry") : t("calendar.newEntry")}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <span className="font-medium text-sm">{dateLabel}</span>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* ── Target ────────────────────────────────────── */}
          <div>
            <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              {t("project")}
            </p>

            {kind === "row" && (
              <Popover onOpenChange={setRowPickerOpen} open={rowPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/40"
                    type="button"
                  >
                    {selectedRow ? (
                      <>
                        <ColorDot colorKey={projectColorKey(selectedRow)} />
                        <span className="truncate">
                          {rowLabel(selectedRow)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("selectProject")}
                      </span>
                    )}
                    <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                >
                  <Command>
                    <CommandInput
                      className="h-9"
                      placeholder={t("searchProjects")}
                    />
                    <CommandList className="max-h-[240px] overflow-y-auto">
                      <CommandEmpty className="py-4 text-center text-sm">
                        {t("noProjectFound")}
                      </CommandEmpty>
                      <CommandGroup>
                        {recentRows.map((row) => (
                          <CommandItem
                            key={row.id}
                            onSelect={() => {
                              setRowId(row.id);
                              setRowPickerOpen(false);
                            }}
                            value={`${row.client_name} ${rowLabel(row)}`}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 shrink-0 ${rowId === row.id ? "opacity-100" : "opacity-0"}`}
                            />
                            <ColorDot colorKey={projectColorKey(row)} />
                            <span className="ml-1.5 truncate">
                              {rowLabel(row)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            {kind === "task" && (
              <Popover onOpenChange={setTaskPickerOpen} open={taskPickerOpen}>
                <PopoverTrigger asChild>
                  <button
                    className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent/40"
                    type="button"
                  >
                    {taskId ? (
                      <span className="truncate">
                        {allTasks.find((task) => task.id === taskId)?.title}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("selectTask")}
                      </span>
                    )}
                    <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[var(--radix-popover-trigger-width)] p-0"
                >
                  <Command>
                    <CommandInput
                      className="h-9"
                      placeholder={t("searchTasks")}
                    />
                    <CommandList className="max-h-[240px] overflow-y-auto">
                      <CommandEmpty className="py-4 text-center text-sm">
                        {t("noTaskFound")}
                      </CommandEmpty>
                      <CommandGroup>
                        {allTasks.map((task) => (
                          <CommandItem
                            key={task.id}
                            onSelect={() => {
                              setTaskId(task.id);
                              setTaskPickerOpen(false);
                            }}
                            value={task.title}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 shrink-0 ${taskId === task.id ? "opacity-100" : "opacity-0"}`}
                            />
                            <span className="truncate">{task.title}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}

            {kind === "project" && (
              <div className="flex flex-wrap items-center gap-2">
                <Popover onOpenChange={setProjectOpen} open={projectOpen}>
                  <PopoverTrigger asChild>
                    <button
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors",
                        projectId
                          ? "bg-accent font-medium text-accent-foreground"
                          : "border border-dashed text-muted-foreground hover:border-border hover:text-foreground",
                      ].join(" ")}
                      type="button"
                    >
                      {projectId ? (
                        <>
                          <ColorDot colorKey={projectId} />
                          {allProjects.find((p) => p.id === projectId)?.title}
                          <X
                            className="h-3 w-3 opacity-50 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectId("");
                              setPhaseId("");
                              setProjectTaskId("");
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          {t("selectProject")}
                        </>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-[320px] p-0">
                    <Command>
                      <CommandInput
                        className="h-9"
                        placeholder={t("searchProjects")}
                      />
                      <CommandList className="max-h-[260px] overflow-y-auto">
                        <CommandEmpty className="py-4 text-center text-sm">
                          {t("noProjectFound")}
                        </CommandEmpty>
                        <CommandGroup>
                          {allProjects.map((project) => (
                            <CommandItem
                              key={project.id}
                              onSelect={() => {
                                setProjectId(project.id);
                                setPhaseId("");
                                setProjectTaskId("");
                                setProjectOpen(false);
                              }}
                              value={`${project.client_name ?? ""} ${project.title}`}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 shrink-0 ${projectId === project.id ? "opacity-100" : "opacity-0"}`}
                              />
                              {project.client_name ?? t("manual")} /{" "}
                              {project.title}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {projectId && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    <Popover onOpenChange={setPhaseOpen} open={phaseOpen}>
                      <PopoverTrigger asChild>
                        <button
                          className={[
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                            phaseId
                              ? "bg-accent font-medium text-accent-foreground"
                              : "border border-dashed text-muted-foreground hover:border-border hover:text-foreground",
                          ].join(" ")}
                          type="button"
                        >
                          {phaseId
                            ? phaseId === "general"
                              ? t("general")
                              : phases.find((p) => p.id === phaseId)?.title
                            : t("phaseOptional")}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="max-h-[260px] w-56 overflow-y-auto p-1"
                      >
                        {["general", ...phases.map((p) => p.id)].map((id) => (
                          <button
                            className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            key={id}
                            onClick={() => {
                              setPhaseId(id);
                              setProjectTaskId("");
                              setPhaseOpen(false);
                            }}
                            type="button"
                          >
                            {id === "general"
                              ? t("general")
                              : phases.find((p) => p.id === id)?.title}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </>
                )}

                {phaseId && projectTasks.length > 0 && (
                  <>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                    <Popover
                      onOpenChange={setProjectTaskOpen}
                      open={projectTaskOpen}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className={[
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors",
                            projectTaskId
                              ? "bg-accent font-medium text-accent-foreground"
                              : "border border-dashed text-muted-foreground hover:border-border hover:text-foreground",
                          ].join(" ")}
                          type="button"
                        >
                          {projectTaskId
                            ? projectTasks.find((p) => p.id === projectTaskId)
                                ?.title
                            : t("taskOptional")}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="max-h-[260px] w-64 overflow-y-auto p-1"
                      >
                        {projectTasks.map((task) => (
                          <button
                            className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            key={task.id}
                            onClick={() => {
                              setProjectTaskId(task.id);
                              setProjectTaskOpen(false);
                            }}
                            type="button"
                          >
                            {task.title}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </>
                )}
              </div>
            )}

            {kind === "custom" && (
              <div className="flex flex-col">
                <input
                  className="w-full bg-transparent py-1.5 font-medium text-sm outline-none placeholder:text-muted-foreground/50"
                  onChange={(e) => setManualProject(e.target.value)}
                  placeholder={t("projectPlaceholder")}
                  type="text"
                  value={manualProject}
                />
                <div className="border-t" />
                <input
                  className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
                  onChange={(e) => setManualPhase(e.target.value)}
                  placeholder={t("phasePlaceholder")}
                  type="text"
                  value={manualPhase}
                />
                <div className="border-t" />
                <input
                  className="w-full bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground/50"
                  onChange={(e) => setManualTask(e.target.value)}
                  placeholder={t("taskPlaceholder")}
                  type="text"
                  value={manualTask}
                />
              </div>
            )}
          </div>

          {/* ── Time ──────────────────────────────────────── */}
          <div>
            <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              {t("calendar.time")}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <input
                className="rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
                onChange={(e) => setDate(e.target.value)}
                type="date"
                value={date}
              />
              <input
                className="rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
                onChange={(e) => setStartTime(e.target.value)}
                step={900}
                type="time"
                value={startTime}
              />
              <span className="text-muted-foreground">–</span>
              <input
                className="rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus:border-ring disabled:opacity-40"
                disabled={startMin == null}
                onChange={(e) => {
                  const end = timeToMinutes(e.target.value);
                  if (end != null && startMin != null) {
                    setDurationMin(Math.max(MIN_DURATION, end - startMin));
                  }
                }}
                step={900}
                type="time"
                value={endMin == null ? "" : minutesToTime(endMin)}
              />
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
                {formatDuration(durationMin)}
              </span>
              {startMin == null && (
                <span className="text-muted-foreground text-xs">
                  {t("calendar.noStartHint")}
                </span>
              )}
            </div>
            {startMin == null && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-20 rounded-md border bg-transparent px-2 py-1 text-sm outline-none focus:border-ring"
                  min={0.25}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (Number.isFinite(value) && value > 0) {
                      setDurationMin(Math.round(value * 4) * 15);
                    }
                  }}
                  step={0.25}
                  type="number"
                  value={durationMin / 60}
                />
                <span className="text-muted-foreground text-xs">
                  {t("calendar.hours")}
                </span>
              </div>
            )}
          </div>

          {/* ── Notes ─────────────────────────────────────── */}
          <textarea
            className="min-h-[56px] w-full resize-none rounded-md border bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-ring"
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            value={notes}
          />

          {/* ── Discipline ────────────────────────────────── */}
          <div>
            <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
              {t("discipline")}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={[
                  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
                  discipline
                    ? "border-border text-muted-foreground hover:text-foreground"
                    : "border-transparent bg-accent font-medium text-accent-foreground",
                ].join(" ")}
                onClick={() => setDiscipline("")}
                type="button"
              >
                {t("none")}
              </button>
              {disciplines.map((d) => (
                <button
                  className={[
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs transition-colors",
                    discipline === d.name
                      ? "border-transparent bg-accent font-medium text-accent-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                  key={d.name}
                  onClick={() => setDiscipline(d.name)}
                  title={d.name}
                  type="button"
                >
                  {d.short}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5">
          <div className="flex items-center gap-0.5">
            {recentRows.length > 0 && (
              <ModeChip active={kind === "row"} onClick={() => setKind("row")}>
                {t("calendar.modeRows")}
              </ModeChip>
            )}
            {tasksAvailable && (
              <ModeChip
                active={kind === "task"}
                onClick={() => setKind("task")}
              >
                {t("modeTask")}
              </ModeChip>
            )}
            {projectsAvailable && (
              <ModeChip
                active={kind === "project"}
                onClick={() => setKind("project")}
              >
                {t("modeProject")}
              </ModeChip>
            )}
            <ModeChip
              active={kind === "custom"}
              onClick={() => setKind("custom")}
            >
              {t("modeCustom")}
            </ModeChip>
          </div>

          <div className="flex items-center gap-2">
            {isEdit && onDelete && (
              <Button
                className="h-7 rounded-full px-2 text-xs"
                disabled={saving}
                onClick={handleDelete}
                size="sm"
                variant="ghost"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}

            <Button
              className="h-7 rounded-full px-3 text-xs"
              disabled={!canSubmit || saving}
              onClick={handleSubmit}
              size="sm"
            >
              {t("save")}
            </Button>
          </div>
        </div>

        {error ? (
          <p className="border-t px-5 py-2 text-destructive text-xs">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
