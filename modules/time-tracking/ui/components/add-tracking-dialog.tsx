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
  DialogTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { Check, ChevronRight, Clock, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { TrackingTargetMode } from "../hooks/use-add-tracking-row.js";
import type { Discipline, Option, ProjectOption } from "./types.js";

interface AddTrackingDialogProps {
  addError?: string | null;
  addRowOpen: boolean;
  allProjects: ProjectOption[];
  allTasks: Option[];
  availablePhases: Option[];
  availableTasks: Option[];
  disciplines: Discipline[];
  hideTrigger?: boolean;
  manualPhaseTitle: string;
  manualProjectTitle: string;
  manualTaskTitle: string;
  onAdd: () => void;
  projectsAvailable: boolean;
  selectedDiscipline: string;
  selectedPhase: string;
  selectedProject: string;
  selectedTask: string;
  setAddRowOpen: (open: boolean) => void;
  setManualPhaseTitle: (value: string) => void;
  setManualProjectTitle: (value: string) => void;
  setManualTaskTitle: (value: string) => void;
  setSelectedDiscipline: (discipline: string) => void;
  setSelectedPhase: (phaseId: string) => void;
  setSelectedProject: (projectId: string) => void;
  setSelectedTask: (taskId: string) => void;
  setTrackingMode: (mode: TrackingTargetMode) => void;
  tasksAvailable: boolean;
  trackingMode: TrackingTargetMode;
}

// Small chip button for the bottom mode switcher and inline selectors
function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
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

// Inline chip used in the project-flow (project / phase / task)
function FlowChip({
  children,
  onRemove,
  onClick,
  placeholder,
}: {
  children?: React.ReactNode;
  onRemove?: () => void;
  onClick?: () => void;
  placeholder?: string;
}) {
  if (children) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground text-xs">
        {children}
        {onRemove && (
          <button
            className="ml-0.5 opacity-50 transition-opacity hover:opacity-100"
            onClick={onRemove}
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>
    );
  }
  return (
    <button
      className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:border-border hover:text-foreground"
      onClick={onClick}
      type="button"
    >
      <Plus className="h-3 w-3" />
      {placeholder}
    </button>
  );
}

export function AddTrackingDialog({
  addRowOpen,
  setAddRowOpen,
  allProjects,
  allTasks,
  selectedProject,
  setSelectedProject,
  availablePhases,
  selectedPhase,
  setSelectedPhase,
  availableTasks,
  selectedTask,
  setSelectedTask,
  disciplines,
  selectedDiscipline,
  setSelectedDiscipline,
  projectsAvailable,
  tasksAvailable,
  trackingMode,
  setTrackingMode,
  manualProjectTitle,
  setManualProjectTitle,
  manualPhaseTitle,
  setManualPhaseTitle,
  manualTaskTitle,
  setManualTaskTitle,
  onAdd,
  addError,
  hideTrigger = false,
}: AddTrackingDialogProps) {
  const { t } = useTranslation("time-tracking");

  // Local UI state — not needed in the hook
  const [taskSearch, setTaskSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [taskInProjectOpen, setTaskInProjectOpen] = useState(false);
  const [disciplineOpen, setDisciplineOpen] = useState(false);

  // Reset local UI state when dialog closes
  useEffect(() => {
    if (!addRowOpen) {
      setTaskSearch("");
      setProjectOpen(false);
      setPhaseOpen(false);
      setTaskInProjectOpen(false);
      setDisciplineOpen(false);
    }
  }, [addRowOpen]);

  const showModePicker = tasksAvailable || projectsAvailable;

  const canSubmit =
    trackingMode === "task"
      ? selectedTask.length > 0
      : trackingMode === "project"
        ? selectedProject.length > 0
        : manualProjectTitle.trim().length > 0 ||
          manualTaskTitle.trim().length > 0;

  const filteredTasks = taskSearch.trim()
    ? allTasks.filter((task) =>
        task.title.toLowerCase().includes(taskSearch.toLowerCase())
      )
    : allTasks;

  const selectedTaskObj = allTasks.find((t) => t.id === selectedTask);
  const selectedProjectObj = allProjects.find((p) => p.id === selectedProject);
  const selectedPhaseObj = availablePhases.find((p) => p.id === selectedPhase);
  const selectedTaskInProjectObj = availableTasks.find(
    (t) => t.id === selectedTask
  );

  const currentDiscipline = disciplines.find(
    (d) => d.name === selectedDiscipline
  );

  return (
    <Dialog onOpenChange={setAddRowOpen} open={addRowOpen}>
      {hideTrigger ? null : (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("addTracking")}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="gap-0 p-0 sm:max-w-[480px]">
        {/* Screen-reader title */}
        <DialogHeader className="sr-only">
          <DialogTitle>{t("addTracking")}</DialogTitle>
        </DialogHeader>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 border-b px-5 py-3.5 pr-12">
          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground text-sm">
            {t("addTracking")}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
          <span className="font-medium text-sm">{t("thisWeek")}</span>
        </div>

        {/* ── Content ─────────────────────────────────────── */}
        <div className="flex min-h-[220px] flex-col px-5 py-5">
          {/* TASK MODE */}
          {trackingMode === "task" && (
            <div className="flex flex-1 flex-col">
              {selectedTask ? (
                // Selected state
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                      {t("task")}
                    </p>
                    <p className="break-words font-medium leading-snug">
                      {selectedTaskObj?.title}
                    </p>
                  </div>
                  <button
                    className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setSelectedTask("")}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                // Search state
                <div className="flex flex-1 flex-col">
                  <div className="relative mb-3">
                    <Search className="absolute top-1/2 left-0 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      autoFocus
                      className="w-full bg-transparent py-1 pr-3 pl-6 text-sm outline-none placeholder:text-muted-foreground/60"
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder={t("searchTasks")}
                      type="text"
                      value={taskSearch}
                    />
                  </div>
                  <div className="-mx-1 max-h-[300px] flex-1 overflow-y-auto border-t">
                    {filteredTasks.length === 0 ? (
                      <p className="py-6 text-center text-muted-foreground text-sm">
                        {t("noTaskFound")}
                      </p>
                    ) : (
                      <div className="pt-1">
                        {filteredTasks.map((task) => (
                          <button
                            className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                            key={task.id}
                            onClick={() => {
                              setSelectedTask(task.id);
                              setTaskSearch("");
                            }}
                            type="button"
                          >
                            {task.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROJECT MODE */}
          {trackingMode === "project" && projectsAvailable && (
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <p className="mb-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
                  {t("project")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Project chip */}
                  {selectedProject ? (
                    <FlowChip
                      onRemove={() => {
                        setSelectedProject("");
                        setSelectedPhase("");
                        setSelectedTask("");
                      }}
                    >
                      {selectedProjectObj?.client_name ?? t("manual")} /{" "}
                      {selectedProjectObj?.title}
                    </FlowChip>
                  ) : (
                    <Popover onOpenChange={setProjectOpen} open={projectOpen}>
                      <PopoverTrigger asChild>
                        <FlowChip
                          onClick={() => setProjectOpen(true)}
                          placeholder={t("selectProject")}
                        />
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] p-0">
                        <Command>
                          <CommandInput
                            className="h-9"
                            placeholder={t("searchProjects")}
                          />
                          <CommandList className="max-h-[300px] overflow-y-auto">
                            <CommandEmpty className="py-4 text-center text-sm">
                              {t("noProjectFound")}
                            </CommandEmpty>
                            <CommandGroup>
                              {allProjects.map((project) => (
                                <CommandItem
                                  key={project.id}
                                  onSelect={() => {
                                    setSelectedProject(project.id);
                                    setProjectOpen(false);
                                  }}
                                  value={`${project.client_name ?? ""} ${project.title}`}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 shrink-0 ${selectedProject === project.id ? "opacity-100" : "opacity-0"}`}
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
                  )}

                  {/* Phase chip — only after project selected */}
                  {selectedProject && (
                    <>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                      {selectedPhase ? (
                        <FlowChip
                          onRemove={() => {
                            setSelectedPhase("");
                            setSelectedTask("");
                          }}
                        >
                          {selectedPhase === "general"
                            ? t("general")
                            : selectedPhaseObj?.title}
                        </FlowChip>
                      ) : (
                        <Popover onOpenChange={setPhaseOpen} open={phaseOpen}>
                          <PopoverTrigger asChild>
                            <FlowChip
                              onClick={() => setPhaseOpen(true)}
                              placeholder={t("phaseOptional")}
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="max-h-[300px] w-56 overflow-y-auto p-1"
                          >
                            <button
                              className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                              onClick={() => {
                                setSelectedPhase("general");
                                setPhaseOpen(false);
                              }}
                              type="button"
                            >
                              {t("general")}
                            </button>
                            {availablePhases.map((phase) => (
                              <button
                                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                key={phase.id}
                                onClick={() => {
                                  setSelectedPhase(phase.id);
                                  setPhaseOpen(false);
                                }}
                                type="button"
                              >
                                {phase.title}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </>
                  )}

                  {/* Task chip — available for any selected phase (including general) */}
                  {selectedPhase && availableTasks.length > 0 && (
                    <>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                      {selectedTask ? (
                        <FlowChip onRemove={() => setSelectedTask("")}>
                          {selectedTaskInProjectObj?.title}
                        </FlowChip>
                      ) : (
                        <Popover
                          onOpenChange={setTaskInProjectOpen}
                          open={taskInProjectOpen}
                        >
                          <PopoverTrigger asChild>
                            <FlowChip
                              onClick={() => setTaskInProjectOpen(true)}
                              placeholder={t("taskOptional")}
                            />
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="max-h-[300px] w-64 overflow-y-auto p-1"
                          >
                            {availableTasks.map((task) => (
                              <button
                                className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                key={task.id}
                                onClick={() => {
                                  setSelectedTask(task.id);
                                  setTaskInProjectOpen(false);
                                }}
                                type="button"
                              >
                                {task.title}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MANUAL MODE */}
          {trackingMode === "custom" && (
            <div className="flex flex-1 flex-col gap-0">
              <input
                autoFocus
                className="w-full bg-transparent py-2 font-medium text-base outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => setManualProjectTitle(e.target.value)}
                placeholder={t("projectPlaceholder")}
                type="text"
                value={manualProjectTitle}
              />
              <div className="border-t" />
              <input
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => setManualPhaseTitle(e.target.value)}
                placeholder={t("phasePlaceholder")}
                type="text"
                value={manualPhaseTitle}
              />
              <div className="border-t" />
              <input
                className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => setManualTaskTitle(e.target.value)}
                placeholder={t("taskPlaceholder")}
                type="text"
                value={manualTaskTitle}
              />
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5">
          {/* Mode switcher */}
          <div className="flex items-center gap-0.5">
            {tasksAvailable && (
              <Chip
                active={trackingMode === "task"}
                onClick={() => setTrackingMode("task")}
              >
                {t("modeTask")}
              </Chip>
            )}
            {projectsAvailable && (
              <Chip
                active={trackingMode === "project"}
                onClick={() => setTrackingMode("project")}
              >
                {t("modeProject")}
              </Chip>
            )}
            <Chip
              active={trackingMode === "custom"}
              onClick={() => setTrackingMode("custom")}
            >
              {t("modeCustom")}
            </Chip>
          </div>

          {/* Discipline + Submit */}
          <div className="flex items-center gap-2">
            {/* Discipline chip */}
            <Popover onOpenChange={setDisciplineOpen} open={disciplineOpen}>
              <PopoverTrigger asChild>
                <button
                  className={[
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-xs transition-colors",
                    selectedDiscipline
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  ].join(" ")}
                  type="button"
                >
                  {currentDiscipline
                    ? currentDiscipline.short
                    : t("disciplineOptional")}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1">
                <button
                  className="w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    setSelectedDiscipline("");
                    setDisciplineOpen(false);
                  }}
                  type="button"
                >
                  — {t("none")}
                </button>
                {disciplines.map((d) => (
                  <button
                    className={[
                      "w-full rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                      selectedDiscipline === d.name ? "font-medium" : "",
                    ].join(" ")}
                    key={d.name}
                    onClick={() => {
                      setSelectedDiscipline(d.name);
                      setDisciplineOpen(false);
                    }}
                    type="button"
                  >
                    {d.short} · {d.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            <Button
              className="h-7 rounded-full px-3 text-xs"
              disabled={!canSubmit}
              onClick={onAdd}
              size="sm"
            >
              {t("addTracking")}
            </Button>
          </div>
        </div>

        {addError ? (
          <p className="border-t px-5 py-2 text-destructive text-xs">
            {addError}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
