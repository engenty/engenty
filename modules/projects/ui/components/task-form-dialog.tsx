import { useTranslation } from "@engenty/i18n/ui";
import {
  TaskCollaboratorsPicker,
  type TeamMemberCatalogRow,
} from "@engenty/tasks/ui/assignee";
import { TaskCommentsPanel } from "@engenty/tasks/ui/comments";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SidePanel,
  SidePanelContent,
  SidePanelFooter,
} from "@engenty/ui-core";
import { Check, Clock, Eye, EyeOff, Layers, Tag } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PhaseTask, ProjectTaskStatusDefinition } from "../api.js";
import { useSidePanelWidth } from "../hooks/use-side-panel-width.js";
import { buildProjectTaskMemberOptions } from "../lib/project-team-members-ui.js";
import { TASK_STATUS_KANBAN_DOT } from "../lib/task-status-styles.js";
import { TaskFormPanelHeader } from "./task-form-panel-header.js";

const TASK_FORM_WIDTH_KEY = "projects.taskFormWidth";
const TASK_FORM_DEFAULT_WIDTH = 672;
const TASK_FORM_MIN_WIDTH = 360;

/** Minimal phase shape needed to drive the phase selector pill. */
export interface TaskFormPhaseOption {
  id: string;
  title: string;
}

interface TaskFormDialogProps {
  onDelete?: (taskId: string) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    title: string;
    content: string | null;
    status: string;
    is_public: boolean;
    phase_id?: string | null;
    discipline?: string | null;
    hours?: number | null;
    team_member_ids?: string[];
  }) => Promise<void>;
  open: boolean;
  phaseId?: string | null;
  /** Phases the task can be assigned to; when provided, a phase pill is shown. */
  phases?: TaskFormPhaseOption[];
  /** Ids already on the project (for grouped picker); may be empty. */
  projectMemberIds: string[];
  /** Name of the (fixed) project this task belongs to — used for a11y title. */
  projectName?: string;
  task?: PhaseTask | null;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
  teamMembersCatalog: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
  teamMembersError?: string | null;
  teamMembersLoading?: boolean;
}

// Shared pill trigger style — mirrors the tasks module's new-task dialog chrome.
const pillClass =
  "inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent/50 cursor-pointer";

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  onDelete,
  onSubmit,
  task,
  phaseId,
  phases,
  projectName,
  teamMembersCatalog,
  projectMemberIds,
  teamMembersEnabled = false,
  teamMembersError = null,
  teamMembersLoading = false,
  taskStatusDefinitions,
}: TaskFormDialogProps) {
  const { t } = useTranslation("projects");
  const navigate = useNavigate();
  const formId = useId();
  const { width, startResize } = useSidePanelWidth({
    storageKey: TASK_FORM_WIDTH_KEY,
    defaultWidth: TASK_FORM_DEFAULT_WIDTH,
    minWidth: TASK_FORM_MIN_WIDTH,
  });
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string>("todo");
  const [isPublic, setIsPublic] = useState(false);
  const [phaseIdValue, setPhaseIdValue] = useState<string | null>(null);
  const [discipline, setDiscipline] = useState("");
  const [hours, setHours] = useState("");
  const [teamMemberIds, setTeamMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const [disciplineOpen, setDisciplineOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task?.title ?? "");
      setContent(task?.content ?? "");
      const ids = taskStatusDefinitions.map((d) => d.id);
      const fromTask = task?.status;
      setStatus(
        fromTask && ids.includes(fromTask)
          ? fromTask
          : (taskStatusDefinitions[0]?.id ?? "todo")
      );
      setIsPublic(task?.is_public ?? false);
      setPhaseIdValue(task?.phase_id ?? phaseId ?? null);
      setDiscipline(task?.discipline ?? "");
      setHours(task?.hours?.toString() ?? "");
      setTeamMemberIds(task?.task_team?.map((m) => m.user_id) ?? []);
      setError(null);
    }
  }, [open, task, phaseId, taskStatusDefinitions]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      if (!title.trim()) {
        setError(t("detail.taskForm.titleRequired"));
        return;
      }
      setSubmitting(true);
      try {
        await onSubmit({
          title: title.trim(),
          content: content.trim() || null,
          status,
          is_public: isPublic,
          phase_id: phaseIdValue,
          discipline: discipline.trim() || null,
          hours: hours ? Number.parseFloat(hours) : null,
          team_member_ids: teamMemberIds,
        });
        onOpenChange(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("task_collaborator_requires_linked_user")) {
          setError(t("detail.taskForm.assigneeLinkedUserRequired"));
        } else if (message.includes("task_collaborator_invalid_user")) {
          setError(t("detail.taskForm.assigneeInvalidUser"));
        } else {
          setError(message || t("detail.taskForm.saveFailed"));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      title,
      content,
      status,
      isPublic,
      phaseIdValue,
      discipline,
      hours,
      teamMemberIds,
      onSubmit,
      onOpenChange,
      t,
    ]
  );

  const assigneeOptions = useMemo(
    () =>
      buildProjectTaskMemberOptions({
        catalog: teamMembersCatalog,
        projectMemberIds,
        inProjectLabel: t("detail.members.inProject"),
        otherTeamMembersLabel: t("detail.members.otherTeamMembers"),
      }),
    [teamMembersCatalog, projectMemberIds, t]
  );

  const currentStatus =
    taskStatusDefinitions.find((d) => d.id === status) ??
    taskStatusDefinitions[0];
  const selectedPhase = phases?.find((p) => p.id === phaseIdValue) ?? null;
  const showPhasePill = Boolean(phases && phases.length > 0);

  const panelTitle = task
    ? t("detail.taskForm.editTask")
    : t("detail.taskForm.newTask");
  const a11yTitle = projectName ? `${panelTitle} — ${projectName}` : panelTitle;

  const handleExpand = useCallback(() => {
    if (!task) {
      return;
    }
    onOpenChange(false);
    navigate(`/mdl/tasks/${encodeURIComponent(task.id)}`);
  }, [navigate, onOpenChange, task]);

  const handleDelete = useCallback(() => {
    if (!(task && onDelete)) {
      return;
    }
    void Promise.resolve(onDelete(task.id)).then(() => onOpenChange(false));
  }, [onDelete, onOpenChange, task]);

  return (
    <SidePanel onOpenChange={onOpenChange} open={open}>
      <SidePanelContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none"
        showCloseButton={false}
        style={{ width: `${width}px`, maxWidth: "95vw" }}
      >
        {/* Drag handle — resize the panel from its left edge. */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 z-50 w-1.5 cursor-col-resize transition-colors hover:bg-primary/40 active:bg-primary/60"
          onPointerDown={startResize}
        />
        <TaskFormPanelHeader
          canDelete={Boolean(task && onDelete)}
          canExpand={Boolean(task)}
          onClose={() => onOpenChange(false)}
          onDelete={handleDelete}
          onExpand={handleExpand}
          projectName={projectName}
          title={a11yTitle}
        />

        {/* The comments composer is its own form, so it stays a sibling of the
            task form rather than nesting inside it. */}
        <div className="flex-1 overflow-y-auto">
          <form className="space-y-3 p-4" id={formId} onSubmit={handleSubmit}>
            <textarea
              autoFocus
              className="w-full resize-none overflow-hidden bg-transparent font-semibold text-lg outline-none placeholder:text-muted-foreground/50"
              onChange={(e) => {
                setTitle(e.target.value);
                autoGrow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                }
              }}
              placeholder={t("detail.taskForm.titlePlaceholder")}
              rows={1}
              value={title}
            />

            {/* Metadata pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Status */}
              <Popover modal onOpenChange={setStatusOpen} open={statusOpen}>
                <PopoverTrigger asChild>
                  <button className={pillClass} type="button">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        TASK_STATUS_KANBAN_DOT[currentStatus?.color ?? "slate"]
                      }`}
                    />
                    <span>{currentStatus?.label ?? status}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-48 p-1">
                  {taskStatusDefinitions.map((def) => (
                    <button
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      key={def.id}
                      onClick={() => {
                        setStatus(def.id);
                        setStatusOpen(false);
                      }}
                      type="button"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${TASK_STATUS_KANBAN_DOT[def.color]}`}
                      />
                      <span className="flex-1 text-left">{def.label}</span>
                      {status === def.id && (
                        <Check className="h-4 w-4 text-foreground" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Phase */}
              {showPhasePill ? (
                <Popover modal onOpenChange={setPhaseOpen} open={phaseOpen}>
                  <PopoverTrigger asChild>
                    <button className={pillClass} type="button">
                      <Layers className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[160px] truncate">
                        {selectedPhase
                          ? selectedPhase.title
                          : t("detail.taskForm.generalPhase")}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-0">
                    <Command className="bg-transparent">
                      <CommandInput
                        placeholder={t("detail.taskForm.searchPhases")}
                      />
                      <CommandList className="max-h-64 overflow-y-auto">
                        <CommandEmpty>
                          {t("detail.taskForm.noPhaseMatch")}
                        </CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
                            onSelect={() => {
                              setPhaseIdValue(null);
                              setPhaseOpen(false);
                            }}
                          >
                            <span className="text-muted-foreground">
                              {t("detail.taskForm.generalPhase")}
                            </span>
                            {!phaseIdValue && (
                              <Check className="h-4 w-4 shrink-0 text-foreground" />
                            )}
                          </CommandItem>
                          {phases?.map((p) => (
                            <CommandItem
                              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-sm"
                              key={p.id}
                              onSelect={() => {
                                setPhaseIdValue(p.id);
                                setPhaseOpen(false);
                              }}
                              value={p.title.toLowerCase()}
                            >
                              <span className="truncate">{p.title}</span>
                              {phaseIdValue === p.id && (
                                <Check className="h-4 w-4 shrink-0 text-foreground" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              ) : null}

              {/* Discipline */}
              <Popover
                modal
                onOpenChange={setDisciplineOpen}
                open={disciplineOpen}
              >
                <PopoverTrigger asChild>
                  <button className={pillClass} type="button">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    <span className={discipline ? "" : "text-muted-foreground"}>
                      {discipline || t("detail.taskForm.discipline")}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-2">
                  <Input
                    onChange={(e) => setDiscipline(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setDisciplineOpen(false);
                      }
                    }}
                    placeholder={t("detail.taskForm.disciplinePlaceholder")}
                    value={discipline}
                  />
                </PopoverContent>
              </Popover>

              {/* Estimated hours */}
              <Popover modal onOpenChange={setHoursOpen} open={hoursOpen}>
                <PopoverTrigger asChild>
                  <button className={pillClass} type="button">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className={hours ? "" : "text-muted-foreground"}>
                      {hours
                        ? `${hours} ${t("detail.taskForm.hoursSuffix")}`
                        : t("detail.taskForm.hours")}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-40 p-2">
                  <Input
                    min="0"
                    onChange={(e) => setHours(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        setHoursOpen(false);
                      }
                    }}
                    placeholder={t("detail.taskForm.hours")}
                    step="0.5"
                    type="number"
                    value={hours}
                  />
                </PopoverContent>
              </Popover>

              {/* Visible to client */}
              <button
                className={`${pillClass} ${
                  isPublic ? "border-primary/40 bg-primary/5 text-primary" : ""
                }`}
                onClick={() => setIsPublic((v) => !v)}
                type="button"
              >
                {isPublic ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                )}
                <span>
                  {isPublic
                    ? t("detail.taskForm.visibleToClient")
                    : t("detail.taskForm.internal")}
                </span>
              </button>
            </div>

            <textarea
              className="min-h-[120px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
              onChange={(e) => {
                setContent(e.target.value);
                autoGrow(e.target);
              }}
              placeholder={t("detail.taskForm.descriptionPlaceholder")}
              value={content}
            />

            {teamMembersEnabled ? (
              <TaskCollaboratorsPicker
                catalog={teamMembersCatalog}
                error={teamMembersError}
                key={`${String(open)}-${task?.id ?? "new"}`}
                label={t("detail.members.assignees")}
                loading={teamMembersLoading}
                onSelectedIdsChange={setTeamMemberIds}
                options={assigneeOptions}
                placeholder={t("detail.members.selectMembers")}
                selectedIds={teamMemberIds}
                teamMembersEnabled={teamMembersEnabled}
              />
            ) : null}

            {error ? <p className="text-destructive text-sm">{error}</p> : null}
          </form>

          {task ? (
            <div className="border-t px-4 pt-4 pb-2">
              <TaskCommentsPanel taskId={task.id} />
            </div>
          ) : null}
        </div>

        <SidePanelFooter className="p-4">
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t("create.cancel")}
          </Button>
          <Button disabled={submitting} form={formId} type="submit">
            {task ? t("detail.taskForm.save") : t("create.create")}
          </Button>
        </SidePanelFooter>
      </SidePanelContent>
    </SidePanel>
  );
}
