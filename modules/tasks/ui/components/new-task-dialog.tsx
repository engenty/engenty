// Paperclip-inspired task creation dialog — title/assignee/goal in body,
// status + priority chips in footer bar. Keeps chrome minimal.
import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@engenty/ui-core";
import { FolderKanban, Loader2, Target, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TaskPriority,
  TaskStatusDefinition,
} from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { useAgentCatalogQuery } from "../hooks/use-agent-catalog-query.js";
import { resolveTaskStatusDotTone } from "../lib/task-status-styles.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { useGoalsListQuery } from "../tasks-queries.js";
import {
  AssigneePillContent,
  GoalSelectorContent,
  PRIORITY_META,
  PrioritySelectorContent,
  ProjectSelectorContent,
  pillClass,
  StatusSelectorContent,
} from "./new-task-selectors.js";
import {
  type TaskAssigneeValue,
  UnifiedAssigneeSelector,
} from "./task-assignee-picker.js";
import type { TaskFormSubmitData } from "./task-form-dialog.js";

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

interface NewTaskDialogProps {
  defaultGoalId?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormSubmitData) => Promise<void>;
  open: boolean;
  taskStatusDefinitions?: TaskStatusDefinition[];
  teamMembersCatalog?: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
}

const EMPTY_ASSIGNEE: TaskAssigneeValue = {
  collaborator_user_ids: [],
  primary_assignee_agent_type_key: null,
  primary_assignee_kind: "none",
  primary_assignee_user_id: null,
};

export function NewTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultGoalId = null,
  taskStatusDefinitions,
  teamMembersCatalog = [],
  teamMembersEnabled = false,
}: NewTaskDialogProps) {
  const { t } = useTranslation("tasks");
  const defs = taskStatusDefinitions?.length
    ? taskStatusDefinitions
    : BUILTIN_TASK_STATUS_DEFINITIONS;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [goalId, setGoalId] = useState<string | null>(defaultGoalId ?? null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<TaskAssigneeValue>(EMPTY_ASSIGNEE);
  const [submitting, setSubmitting] = useState(false);

  const [projectOpen, setProjectOpen] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setStatus("todo");
      setPriority("medium");
      setGoalId(defaultGoalId ?? null);
      setProjectId(null);
      setAssignee(EMPTY_ASSIGNEE);
      setSubmitting(false);
    }
  }, [open, defaultGoalId]);

  // Data
  const agentCatalog = useAgentCatalogQuery();
  const agentOptions = useMemo(
    () =>
      agentCatalog.agents.map((a) => ({
        value: a.agent_type_key,
        label: a.label,
      })),
    [agentCatalog.agents]
  );

  const goalsQuery = useGoalsListQuery({
    status: "active",
    pageSize: 100,
    sortBy: "title",
    sortOrder: "asc",
  });
  const goals = goalsQuery.data?.data ?? [];
  const selectedGoal = useMemo(
    () => goals.find((g) => g.id === goalId) ?? null,
    [goals, goalId]
  );

  const projectsQuery = useProjectsQuery();
  const projects = projectsQuery.data ?? [];
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId]
  );

  // Resolve assignee display name
  const assigneeLabel = useMemo(() => {
    if (assignee.primary_assignee_kind === "user") {
      const m = teamMembersCatalog.find(
        (r) =>
          r.user_id === assignee.primary_assignee_user_id ||
          r.id === assignee.primary_assignee_user_id
      );
      return m?.full_name ?? null;
    }
    if (assignee.primary_assignee_kind === "agent") {
      return (
        agentOptions.find(
          (a) => a.value === assignee.primary_assignee_agent_type_key
        )?.label ?? assignee.primary_assignee_agent_type_key
      );
    }
    return null;
  }, [assignee, teamMembersCatalog, agentOptions]);

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
        priority,
        due_date: null,
        goal_id: goalId,
        project_id: projectId,
        primary_assignee_kind: assignee.primary_assignee_kind,
        primary_assignee_user_id: assignee.primary_assignee_user_id,
        primary_assignee_agent_type_key:
          assignee.primary_assignee_agent_type_key,
        collaborator_user_ids: assignee.collaborator_user_ids,
      });
      onOpenChange(false);
    } catch {
      setSubmitting(false);
    }
  }, [
    title,
    description,
    status,
    priority,
    goalId,
    assignee,
    submitting,
    onSubmit,
    onOpenChange,
  ]);

  const currentStatusDef = defs.find((d) => d.id === status) ?? defs[0];
  const PriorityIcon = PRIORITY_META[priority].icon;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-muted-foreground text-sm">
            {t("tabs.tasks")}
            <span className="mx-1.5">›</span>
            <span className="text-foreground">{t("newTask.title")}</span>
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
            placeholder={t("newTask.titlePlaceholder")}
            ref={titleRef}
            rows={1}
            value={title}
          />

          {/* [Project]  For [Assignee]  in [Goal] */}
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

            <span>{t("newTask.forLabel")}</span>
            <Popover modal onOpenChange={setAssigneeOpen} open={assigneeOpen}>
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
                  agentOptions={agentOptions}
                  catalog={teamMembersCatalog}
                  onChange={setAssignee}
                  onSelect={() => setAssigneeOpen(false)}
                  teamMembersEnabled={teamMembersEnabled}
                  value={assignee}
                />
              </PopoverContent>
            </Popover>

            <span>{t("newTask.inLabel")}</span>
            <Popover modal onOpenChange={setGoalOpen} open={goalOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  {selectedGoal ? (
                    <>
                      <Target className="h-3 w-3 text-muted-foreground" />
                      <span className="max-w-[140px] truncate">
                        {selectedGoal.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("newTask.goalPlaceholder")}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-0">
                <GoalSelectorContent
                  goalId={goalId}
                  goals={goals}
                  onSelect={(id) => {
                    setGoalId(id);
                    setGoalOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <textarea
            className="min-h-[100px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            onChange={(e) => {
              setDescription(e.target.value);
              autoGrow(e.target);
            }}
            placeholder={t("newTask.descriptionPlaceholder")}
            value={description}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Popover modal onOpenChange={setStatusOpen} open={statusOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  <span
                    className={`h-2 w-2 rounded-full ${resolveTaskStatusDotTone(currentStatusDef?.color)}`}
                  />
                  <span>{currentStatusDef?.label}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-48 p-1">
                <StatusSelectorContent
                  defs={defs}
                  onSelect={(id) => {
                    setStatus(id);
                    setStatusOpen(false);
                  }}
                  status={status}
                />
              </PopoverContent>
            </Popover>

            <Popover modal onOpenChange={setPriorityOpen} open={priorityOpen}>
              <PopoverTrigger asChild>
                <button className={pillClass} type="button">
                  <PriorityIcon
                    className={`h-3 w-3 ${PRIORITY_META[priority].className}`}
                  />
                  <span>{t(`priority.${priority}`)}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-44 p-1">
                <PrioritySelectorContent
                  onSelect={(p) => {
                    setPriority(p);
                    setPriorityOpen(false);
                  }}
                  priority={priority}
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
            ) : (
              t("newTask.createButton")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
