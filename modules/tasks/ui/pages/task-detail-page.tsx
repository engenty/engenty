import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { useLiveCache } from "@engenty/live-cache";
import { useQueryClient } from "@engenty/query-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Textarea,
  topbarIconButtonClassName,
} from "@engenty/ui-core";
import { usePageConfig, useWorkspaceContext } from "@engenty/ui-plugin-sdk";
import { MoreHorizontal, Trash2 } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { taskWorkspaceKey } from "../../src/lib/task-workspace.js";
import type { Task, TaskPriority, TaskStatus } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { GoalDocumentTitle } from "../components/goal-document-title.js";
import { LiveTaskRunsPanel } from "../components/live-task-runs-panel.js";
import type { TaskAssigneeValue } from "../components/task-assignee-picker.js";
import { TaskCommentsActivityTabs } from "../components/task-comments-activity-tabs.js";
import { TaskLinkedSessionsPanel } from "../components/task-linked-sessions-panel.js";
import { TaskPropertiesPanel } from "../components/task-properties-panel.js";
import { TaskRunObserverPanel } from "../components/task-run-observer-panel.js";
import { TaskStatusBadge } from "../components/task-status-badge.js";
import { TaskWorkspaceStrip } from "../components/task-workspace-strip.js";
import {
  TaskRunObserverProvider,
  type TaskRunObserverStatus,
  useTaskRunObserverContext,
} from "../context/task-run-observer-context.js";
import { useTasksDetailAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { useTaskDetailCopilotContextOverride } from "../lib/task-copilot-context.js";
import { showTaskSaveErrorToast } from "../lib/task-lifecycle-ui.js";
import { canContinueTaskFromUserComment } from "../lib/task-run-live.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { buildAssigneeProfileMap } from "../plugins.js";
import { createTaskDetailLiveBindings } from "../tasks-live-cache.js";
import {
  invalidateTaskDetailLiveQueries,
  useAddTaskCommentMutation,
  useCurrentUserDisplayNameQuery,
  useDeleteTaskMutation,
  useReleaseTaskMutation,
  useTaskActivityQuery,
  useTaskDetailQuery,
  useTaskLinkedSessionsQuery,
  useTaskRunsQuery,
  useTaskSettingsQuery,
  useUpdateTaskMutation,
} from "../tasks-queries.js";

interface TaskDetailLoadedProps {
  activity: ReturnType<typeof useTaskActivityQuery>["data"];
  assigneeProfiles: Map<string, { full_name: string; id: string }>;
  commentDraft: string;
  commentMutation: ReturnType<typeof useAddTaskCommentMutation>;
  descriptionDraft: string;
  fieldsDisabled: boolean;
  linkedSessionsQuery: ReturnType<typeof useTaskLinkedSessionsQuery>;
  onAssigneeChange: (assignee: TaskAssigneeValue) => void;
  onCommentDraftChange: (value: string) => void;
  onDescriptionBlur: () => void;
  onDescriptionChange: (value: string) => void;
  onDueDateChange: (dueDate: string | null) => void;
  onGoalChange: (goalId: string | null) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onStartWork: () => void;
  onStatusChange: (status: TaskStatus) => void;
  onTitleBlur: () => void;
  onTitleChange: (value: string) => void;
  releaseMutation: ReturnType<typeof useReleaseTaskMutation>;
  runs: NonNullable<ReturnType<typeof useTaskRunsQuery>["data"]>;
  scrollRootRef: RefObject<HTMLElement | null>;
  task: Task;
  taskStatusDefinitions: typeof BUILTIN_TASK_STATUS_DEFINITIONS;
  teamMembersCatalogQuery: ReturnType<typeof useTeamMembersCatalogQuery>;
  titleDraft: string;
}

function TaskDetailLoadedContent({
  activity,
  assigneeProfiles,
  commentDraft,
  commentMutation,
  descriptionDraft,
  fieldsDisabled,
  linkedSessionsQuery,
  onAssigneeChange,
  onCommentDraftChange,
  onDescriptionBlur,
  onDescriptionChange,
  onDueDateChange,
  onGoalChange,
  onPriorityChange,
  onStartWork,
  onStatusChange,
  onTitleBlur,
  onTitleChange,
  releaseMutation,
  runs,
  scrollRootRef,
  task,
  taskStatusDefinitions,
  teamMembersCatalogQuery,
  titleDraft,
}: TaskDetailLoadedProps) {
  const { t } = useTranslation("tasks");
  const { continueFromUserComment, viewRun } = useTaskRunObserverContext();

  const handleAddComment = async () => {
    const content = commentDraft.trim();
    if (!content) {
      return;
    }
    await commentMutation.mutateAsync(content);
    onCommentDraftChange("");
    if (canContinueTaskFromUserComment({ runs, task })) {
      await continueFromUserComment(content, runs);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_minmax(280px,280px)]">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 font-mono text-muted-foreground text-sm">
            {task.identifier}
            <TaskStatusBadge
              compact
              definitions={taskStatusDefinitions}
              status={task.status}
            />
          </p>
          <GoalDocumentTitle
            disabled={fieldsDisabled}
            onBlur={onTitleBlur}
            onChange={onTitleChange}
            placeholder={t("form.title")}
            value={titleDraft}
          />
        </div>

        <Card className="p-0" variant="form">
          <Textarea
            className="min-h-[120px] resize-y rounded-none border-0 bg-transparent px-0 py-0 shadow-none transition-colors hover:bg-input/25 focus-visible:border-transparent focus-visible:bg-input/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
            disabled={fieldsDisabled}
            onBlur={onDescriptionBlur}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder={t("detail.descriptionPlaceholder")}
            rows={6}
            value={descriptionDraft}
          />
        </Card>

        <LiveTaskRunsPanel
          activity={activity ?? []}
          assigneeProfiles={assigneeProfiles}
          disabled={releaseMutation.isPending}
          onRelease={(run) =>
            void releaseMutation.mutateAsync({
              agent_session_run_id: run.agent_session_run_id,
            })
          }
          onViewRun={(run) => void viewRun(run)}
          releasing={releaseMutation.isPending}
          runs={runs}
        />

        <TaskRunObserverPanel />

        <TaskCommentsActivityTabs
          activity={activity ?? []}
          assigneeProfiles={assigneeProfiles}
          commentDraft={commentDraft}
          disabled={commentMutation.isPending}
          onAddComment={() => void handleAddComment()}
          onCommentDraftChange={onCommentDraftChange}
          posting={commentMutation.isPending}
          scrollRootRef={scrollRootRef}
          statusDefinitions={taskStatusDefinitions}
          task={task}
        />
      </div>

      <div className="flex min-w-[280px] flex-col gap-4">
        <TaskPropertiesPanel
          assigneeCatalog={teamMembersCatalogQuery.data ?? []}
          assigneeCatalogLoading={teamMembersCatalogQuery.isLoading}
          assigneeProfiles={assigneeProfiles}
          disabled={fieldsDisabled}
          onAssigneeChange={onAssigneeChange}
          onDueDateChange={onDueDateChange}
          onGoalChange={onGoalChange}
          onPriorityChange={onPriorityChange}
          onStatusChange={onStatusChange}
          task={task}
          taskStatusDefinitions={taskStatusDefinitions}
          teamMembersEnabled={teamMembersCatalogQuery.pluginEnabled}
        />
        <TaskWorkspaceStrip onStartWork={onStartWork} task={task} />
        <TaskLinkedSessionsPanel
          isLoading={linkedSessionsQuery.isLoading}
          sessions={linkedSessionsQuery.data ?? []}
        />
      </div>
    </div>
  );
}

export function TaskDetailPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [commentDraft, setCommentDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const scrollRootRef = useRef<HTMLElement>(null);
  const taskId = id ?? "";
  const [observerPollLive, setObserverPollLive] = useState(false);
  const { currentTenant, currentUserId } = useWorkspaceContext();

  const livePollWhen = useCallback(() => observerPollLive, [observerPollLive]);

  const handleObserverStatusChange = useCallback(
    (status: TaskRunObserverStatus) => {
      setObserverPollLive(
        status === "starting" ||
          status === "streaming" ||
          status === "observing"
      );
    },
    []
  );

  const taskDetailLiveBindings = useMemo(
    () => (taskId ? createTaskDetailLiveBindings(taskId) : []),
    [taskId]
  );

  useLiveCache({
    bindings: taskDetailLiveBindings,
    channelName: `tasks:detail:${currentTenant?.id ?? "none"}:${taskId}`,
    ctx: {
      tenantId: currentTenant?.id ?? "",
      userId: currentUserId ?? undefined,
      routeParams: { taskId },
    },
    enabled: Boolean(taskId && currentTenant?.id),
  });

  const detailQuery = useTaskDetailQuery(id ?? null, livePollWhen);
  const runsQuery = useTaskRunsQuery(id ?? null, livePollWhen);
  const activityQuery = useTaskActivityQuery(id ?? null, livePollWhen);
  const settingsQuery = useTaskSettingsQuery();
  const updateMutation = useUpdateTaskMutation(id ?? "");
  const commentMutation = useAddTaskCommentMutation(id ?? "");
  const releaseMutation = useReleaseTaskMutation(id ?? "");
  const deleteMutation = useDeleteTaskMutation();

  const currentUserProfileQuery = useCurrentUserDisplayNameQuery(currentUserId);

  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const assigneeProfiles = useMemo(() => {
    const map = buildAssigneeProfileMap(teamMembersCatalogQuery.data ?? []);
    const currentUserProfile = currentUserProfileQuery.data;
    if (currentUserProfile && !map.has(currentUserProfile.id)) {
      map.set(currentUserProfile.id, currentUserProfile);
    }
    return map;
  }, [teamMembersCatalogQuery.data, currentUserProfileQuery.data]);

  const task = detailQuery.data ?? null;
  const taskCopilotContextOverride = useTaskDetailCopilotContextOverride(task);
  useTasksDetailAgentUiSlice(task);
  const workspaceKey = task ? taskWorkspaceKey(task.identifier) : null;
  const linkedSessionsQuery = useTaskLinkedSessionsQuery(
    task?.id ?? null,
    workspaceKey
  );
  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  useEffect(() => {
    if (!task) {
      return;
    }
    setTitleDraft(task.title);
    setDescriptionDraft(task.description ?? "");
  }, [task?.description, task?.id, task?.title]);

  const title = task?.title ?? task?.identifier ?? (titleDraft || "…");
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: title }],
    [moduleRootCrumb, title]
  );

  usePageConfig({
    actions: task ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("detail.actionsMenu")}
            className={topbarIconButtonClassName}
            size="sm"
            variant="outline"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("delete.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    title,
    topbarChrome: "contentBlend",
  });

  useEffect(() => {
    if (!taskCopilotContextOverride) {
      return;
    }
    setCopilotContext(taskCopilotContextOverride);
    return () => setCopilotContext(null);
  }, [setCopilotContext, taskCopilotContextOverride]);

  const error =
    detailQuery.error instanceof Error
      ? detailQuery.error.message
      : detailQuery.isError
        ? t("detail.loadFailed")
        : null;

  const runs = runsQuery.data ?? [];
  const activity = activityQuery.data ?? [];

  const fieldsDisabled = updateMutation.isPending;

  const saveTask = async (
    patch: Parameters<typeof updateMutation.mutateAsync>[0]
  ) => {
    try {
      await updateMutation.mutateAsync(patch);
    } catch (err) {
      showTaskSaveErrorToast(err, t);
    }
  };

  const handleTitleBlur = () => {
    if (!task) {
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(task.title);
      return;
    }
    if (trimmed !== task.title) {
      void saveTask({ title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    if (!task) {
      return;
    }
    const nextDescription = descriptionDraft.trim() || null;
    const currentDescription = task.description?.trim() || null;
    if (nextDescription !== currentDescription) {
      void saveTask({ description: nextDescription });
    }
  };

  const handleAssigneeChange = (assignee: TaskAssigneeValue) => {
    void saveTask({
      primary_assignee_kind: assignee.primary_assignee_kind,
      primary_assignee_user_id: assignee.primary_assignee_user_id,
      primary_assignee_agent_type_key: assignee.primary_assignee_agent_type_key,
      collaborator_user_ids: assignee.collaborator_user_ids,
    });
  };

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    await deleteMutation.mutateAsync(id);
    navigate(tasksPaths.list);
  };

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-page pb-10"
      ref={scrollRootRef}
    >
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : detailQuery.isLoading || !task ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : (
        <TaskRunObserverProvider
          onObserverStatusChange={handleObserverStatusChange}
          onRunComplete={() => {
            if (id) {
              invalidateTaskDetailLiveQueries(queryClient, id);
            }
          }}
          task={task}
        >
          <TaskDetailLoadedContent
            activity={activity}
            assigneeProfiles={assigneeProfiles}
            commentDraft={commentDraft}
            commentMutation={commentMutation}
            descriptionDraft={descriptionDraft}
            fieldsDisabled={fieldsDisabled}
            linkedSessionsQuery={linkedSessionsQuery}
            onAssigneeChange={handleAssigneeChange}
            onCommentDraftChange={setCommentDraft}
            onDescriptionBlur={handleDescriptionBlur}
            onDescriptionChange={setDescriptionDraft}
            onDueDateChange={(dueDate) => {
              void saveTask({ due_date: dueDate });
            }}
            onGoalChange={(goalId) => {
              void saveTask({ goal_id: goalId });
            }}
            onPriorityChange={(priority: TaskPriority) => {
              void saveTask({ priority });
            }}
            onProjectChange={(projectId) => {
              void saveTask({ project_id: projectId });
            }}
            onStartWork={() => {
              // Starting an agent run moves a not-yet-started task into
              // progress so the board and Briefing counters reflect live work.
              if (task.status === "todo" || task.status === "backlog") {
                void saveTask({ status: "in_progress" });
              }
            }}
            onStatusChange={(status) => {
              void saveTask({ status });
            }}
            onTitleBlur={handleTitleBlur}
            onTitleChange={setTitleDraft}
            releaseMutation={releaseMutation}
            runs={runs}
            scrollRootRef={scrollRootRef}
            task={task}
            taskStatusDefinitions={taskStatusDefinitions}
            teamMembersCatalogQuery={teamMembersCatalogQuery}
            titleDraft={titleDraft}
          />
        </TaskRunObserverProvider>
      )}

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.confirmDescription", {
                title: task?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("edit.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              {t("delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
