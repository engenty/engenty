// Goal creation dialog — same Paperclip-inspired chrome as NewTaskDialog.
// Title + description in body, project/assignee selectors, status + date in footer.
import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  DatePicker,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { CalendarDays, Check, FolderKanban, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Goal, GoalStatus } from "../../src/schema/types.js";
import { resolveTaskAssigneeLabel } from "../lib/format-assignee.js";
import {
  buildAssigneeProfileMap,
  type TeamMemberCatalogRow,
} from "../plugins.js";
import { GOAL_STATUSES } from "./goal-status-badge.js";
import {
  AssigneePillContent,
  ProjectSelectorContent,
} from "./new-task-selectors.js";
import type { TaskAssigneeValue } from "./task-assignee-picker.js";
import { UnifiedAssigneeSelector } from "./task-assignee-picker.js";

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent/60 cursor-pointer";

const GOAL_STATUS_DOTS: Record<GoalStatus, string> = {
  planned: "bg-slate-500",
  active: "bg-blue-500",
  achieved: "bg-emerald-500",
  cancelled: "bg-muted-foreground/50",
};

// Lightweight project type — avoids importing from the projects module
interface ProjectListItem {
  id: string;
  title: string;
}

function useProjectsQuery() {
  return useQuery({
    queryKey: ["projects", "list-minimal"],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<ProjectListItem[]>(
        "/api/projects?pageSize=100&sortBy=title&sortOrder=asc",
        { method: "GET", signal }
      );
      return res.data;
    },
    staleTime: 60_000,
  });
}

export interface GoalFormSubmitData {
  description: string | null;
  owner_user_id: string | null;
  project_id: string | null;
  status: GoalStatus;
  target_date: string | null;
  title: string;
}

interface GoalFormDialogProps {
  goal?: Goal | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: GoalFormSubmitData) => Promise<void>;
  open: boolean;
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
}

export function GoalFormDialog({
  open,
  onOpenChange,
  onSubmit,
  goal,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
}: GoalFormDialogProps) {
  const { t } = useTranslation("tasks");
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [status, setStatus] = useState<GoalStatus>(goal?.status ?? "planned");
  const [targetDate, setTargetDate] = useState<string | null>(
    goal?.target_date ?? null
  );
  const [projectId, setProjectId] = useState<string | null>(
    goal?.project_id ?? null
  );
  const defaultAssignee: TaskAssigneeValue = {
    collaborator_user_ids: [],
    primary_assignee_agent_type_key: null,
    primary_assignee_kind: goal?.owner_user_id ? "user" : "none",
    primary_assignee_user_id: goal?.owner_user_id ?? null,
  };
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(defaultAssignee);
  const [submitting, setSubmitting] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTitle(goal?.title ?? "");
      setDescription(goal?.description ?? "");
      setStatus(goal?.status ?? "planned");
      setTargetDate(goal?.target_date ?? null);
      setProjectId(goal?.project_id ?? null);
      setAssignee({
        collaborator_user_ids: [],
        primary_assignee_agent_type_key: null,
        primary_assignee_kind: goal?.owner_user_id ? "user" : "none",
        primary_assignee_user_id: goal?.owner_user_id ?? null,
      });
      setSubmitting(false);
    }
  }, [goal, open]);

  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  const assigneeProfiles = useMemo(
    () => buildAssigneeProfileMap(teamMembersCatalog),
    [teamMembersCatalog]
  );

  const assigneeLabel = resolveTaskAssigneeLabel(
    {
      primary_assignee_kind: assignee.primary_assignee_kind,
      primary_assignee_user_id: assignee.primary_assignee_user_id,
      primary_assignee_agent_type_key: assignee.primary_assignee_agent_type_key,
    } as Parameters<typeof resolveTaskAssigneeLabel>[0],
    assigneeProfiles
  );

  const autoGrow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        status,
        target_date: targetDate,
        project_id: projectId,
        owner_user_id:
          assignee.primary_assignee_kind === "user"
            ? assignee.primary_assignee_user_id
            : null,
      });
      onOpenChange(false);
    } catch {
      setSubmitting(false);
    }
  }, [
    title,
    description,
    status,
    targetDate,
    projectId,
    assignee,
    submitting,
    onSubmit,
    onOpenChange,
  ]);

  const isEdit = !!goal;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {t("sidebar.goals")}
            <span className="mx-1.5">›</span>
            <span className="text-foreground">
              {isEdit
                ? t("goals.dialogs.editGoal")
                : t("goals.dialogs.createGoal")}
            </span>
          </span>
          <button
            className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
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
            placeholder={t("goals.form.titlePlaceholder")}
            ref={titleRef}
            rows={1}
            value={title}
          />

          {/* [Project]  For [Owner] */}
          <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
            <Popover modal onOpenChange={setProjectOpen} open={projectOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  {selectedProject ? (
                    <>
                      <FolderKanban className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[140px] truncate">
                        {selectedProject.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("newTask.projectPlaceholder")}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <ProjectSelectorContent
                  onSelect={(id) => {
                    setProjectId(id);
                    setProjectOpen(false);
                  }}
                  projectId={projectId}
                  projects={projects}
                />
              </PopoverContent>
            </Popover>

            {teamMembersEnabled && (
              <>
                <span>{t("newTask.forLabel")}</span>
                <Popover
                  modal
                  onOpenChange={setAssigneeOpen}
                  open={assigneeOpen}
                >
                  <PopoverTrigger asChild>
                    <button className={pillClass} type="button">
                      <AssigneePillContent
                        assignee={assignee}
                        label={assigneeLabel}
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-72 p-0">
                    <UnifiedAssigneeSelector
                      agentOptions={[]}
                      catalog={teamMembersCatalog}
                      onChange={setAssignee}
                      onSelect={() => setAssigneeOpen(false)}
                      teamMembersEnabled={teamMembersEnabled}
                      value={assignee}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>

          <textarea
            className="min-h-[100px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            onChange={(e) => {
              setDescription(e.target.value);
              autoGrow(e.target);
            }}
            placeholder={t("goals.form.descriptionPlaceholder")}
            value={description}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-2.5">
          <div className="flex items-center gap-2">
            {/* Status pill */}
            <Popover modal onOpenChange={setStatusOpen} open={statusOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  <span
                    className={`h-2 w-2 rounded-full ${GOAL_STATUS_DOTS[status]}`}
                  />
                  <span>{t(`goals.status.${status}`)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1">
                {GOAL_STATUSES.map((s) => (
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                    key={s}
                    onClick={() => {
                      setStatus(s);
                      setStatusOpen(false);
                    }}
                    type="button"
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${GOAL_STATUS_DOTS[s]}`}
                    />
                    <span className="flex-1 text-left">
                      {t(`goals.status.${s}`)}
                    </span>
                    {status === s && (
                      <Check className="h-4 w-4 text-foreground" />
                    )}
                  </button>
                ))}
              </PopoverContent>
            </Popover>

            {/* Target date pill */}
            <Popover modal onOpenChange={setDateOpen} open={dateOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" />
                  <span>
                    {targetDate
                      ? new Date(targetDate).toLocaleDateString()
                      : t("goals.form.targetDate")}
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <DatePicker
                  onChange={(val) => {
                    setTargetDate(val);
                    setDateOpen(false);
                  }}
                  value={targetDate}
                />
              </PopoverContent>
            </Popover>
          </div>

          <Button
            disabled={!title.trim() || submitting}
            onClick={handleSubmit}
            size="sm"
            type="button"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("newTask.creating")}
              </>
            ) : isEdit ? (
              t("goals.edit.save")
            ) : (
              t("create.create")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
