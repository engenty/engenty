import {
  ArtifactPaneToggle,
  ENGENTY_COPILOT_HOST_KEY,
  WorkspaceArtifactPane,
} from "@engenty/ai-ui";
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
import { MoreVertical, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { taskWorkspaceKey } from "../../src/lib/task-workspace.js";
import type {
  TaskDetail,
  TaskPriority,
  TaskStatus,
  TaskUpdateInput,
} from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { DocumentTitleInput } from "../components/document-title-input.js";
import { LiveTaskRunsPanel } from "../components/live-task-runs-panel.js";
import { TaskApprovedToolsDialog } from "../components/task-approved-tools-dialog.js";
import type { TaskAssigneeValue } from "../components/task-assignee-picker.js";
import { TaskCommentsActivityTabs } from "../components/task-comments-activity-tabs.js";
import { TaskContextBox } from "../components/task-context-box.js";
import { TaskContextToggle } from "../components/task-context-toggle.js";
import { TaskFieldSuggestionsCard } from "../components/task-field-suggestions-card.js";
import { TaskLocationLine } from "../components/task-location-line.js";
import { TaskPendingApprovalCard } from "../components/task-pending-approval-card.js";
import { TaskPeopleLine } from "../components/task-people-line.js";
import { TaskPlanningLine } from "../components/task-planning-line.js";
import { TaskQuestionCard } from "../components/task-question-card.js";
import { TaskReviewCard } from "../components/task-review-card.js";
import { TaskStatusBadge } from "../components/task-status-badge.js";
import {
  TaskRunObserverProvider,
  type TaskRunObserverStatus,
  useTaskRunObserverContext,
} from "../context/task-run-observer-context.js";
import { useTasksDetailAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTeamMembersCatalogQuery } from "../hooks/use-team-catalog-query.js";
import { resolveOpenTaskQuestion } from "../lib/open-question.js";
import { useTaskDetailCopilotContextOverride } from "../lib/task-copilot-context.js";
import { showTaskSaveErrorToast } from "../lib/task-lifecycle-ui.js";
import {
  canContinueTaskFromUserComment,
  isTaskRunLiveActive,
  resolveCheckoutLinkedRun,
} from "../lib/task-run-live.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import { buildAssigneeProfileMap } from "../plugins.js";
import { createTaskDetailLiveBindings } from "../tasks-live-cache.js";
import {
  invalidateTaskDetailLiveQueries,
  useAddTaskCommentMutation,
  useAnswerTaskQuestionMutation,
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
  answerMutation: ReturnType<typeof useAnswerTaskQuestionMutation>;
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
  onLocationChange: (patch: TaskUpdateInput) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onStatusChange: (status: TaskStatus) => void;
  onTitleBlur: () => void;
  onTitleChange: (value: string) => void;
  registerStartWork: (action: (() => void) | null) => void;
  releaseMutation: ReturnType<typeof useReleaseTaskMutation>;
  runs: NonNullable<ReturnType<typeof useTaskRunsQuery>["data"]>;
  scrollRootRef: RefObject<HTMLElement | null>;
  task: TaskDetail;
  taskStatusDefinitions: typeof BUILTIN_TASK_STATUS_DEFINITIONS;
  teamMembersCatalogQuery: ReturnType<typeof useTeamMembersCatalogQuery>;
  titleDraft: string;
}

function TaskDetailLoadedContent({
  activity,
  answerMutation,
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
  onLocationChange,
  onPriorityChange,
  onStatusChange,
  onTitleBlur,
  onTitleChange,
  registerStartWork,
  releaseMutation,
  runs,
  scrollRootRef,
  task,
  taskStatusDefinitions,
  teamMembersCatalogQuery,
  titleDraft,
}: TaskDetailLoadedProps) {
  const { t } = useTranslation("tasks");
  const {
    continueFromUserComment,
    error: runObserverError,
    startWorkOnTask,
    viewRun,
  } = useTaskRunObserverContext();
  // A task waiting on an answer is not a failed run, and the badge must say so.
  const statusHints = useMemo(
    () => ({
      hasOpenQuestion: Boolean(resolveOpenTaskQuestion(task.comments)),
    }),
    [task.comments]
  );
  const assigneeValue: TaskAssigneeValue = {
    collaborator_user_ids: task.collaborator_user_ids ?? [],
    primary_assignee_agent_type_key: task.primary_assignee_agent_type_key,
    primary_assignee_kind: task.primary_assignee_kind,
    primary_assignee_user_id: task.primary_assignee_user_id,
  };

  // Re-attach the run panel to the task's live run. A dispatched run belongs to
  // the task, not to the browser tab that started it — so opening the page (or
  // reloading mid-run) must show the run that is actually going on. Keyed by
  // run id so closing the panel does not immediately re-open it, and so a
  // later run still attaches.
  const autoAttachedRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    const liveRun = resolveCheckoutLinkedRun(runs, task.checkout_run_id);
    if (!(liveRun && isTaskRunLiveActive(liveRun))) {
      return;
    }
    if (autoAttachedRunIdRef.current === liveRun.agent_session_run_id) {
      return;
    }
    autoAttachedRunIdRef.current = liveRun.agent_session_run_id;
    void viewRun(liveRun, { runs });
  }, [runs, task.checkout_run_id, viewRun]);

  useLayoutEffect(() => {
    const action = () => void startWorkOnTask();
    registerStartWork(action);
    return () => registerStartWork(null);
  }, [registerStartWork, startWorkOnTask]);

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
    <div className="flex min-h-0 flex-1 flex-col bg-card/30">
      <section className="min-h-0 flex-1 overflow-y-auto" ref={scrollRootRef}>
        <div className="mx-auto grid max-w-6xl items-start gap-6 p-page pb-10 lg:has-[aside]:grid-cols-[minmax(0,1fr)_17rem]">
          <main className="min-w-0 space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex min-w-0 flex-wrap items-center gap-2 font-mono text-muted-foreground text-sm">
                  {task.identifier}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild disabled={fieldsDisabled}>
                      <button
                        className="rounded-sm disabled:cursor-default"
                        type="button"
                      >
                        <TaskStatusBadge
                          compact
                          definitions={taskStatusDefinitions}
                          hints={statusHints}
                          status={task.status}
                          task={task}
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {taskStatusDefinitions.map((definition) => (
                        <DropdownMenuItem
                          key={definition.id}
                          onClick={() => {
                            if (definition.id !== task.status) {
                              onStatusChange(definition.id);
                            }
                          }}
                        >
                          <TaskStatusBadge
                            compact
                            definitions={taskStatusDefinitions}
                            status={definition.id}
                          />
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </p>
                <TaskLocationLine
                  disabled={fieldsDisabled}
                  onChange={onLocationChange}
                  task={task}
                />
              </div>
              <DocumentTitleInput
                disabled={fieldsDisabled}
                onBlur={onTitleBlur}
                onChange={onTitleChange}
                placeholder={t("form.title")}
                value={titleDraft}
              />
            </div>

            <TaskPeopleLine
              assigneeProfiles={assigneeProfiles}
              catalog={teamMembersCatalogQuery.data ?? []}
              disabled={fieldsDisabled}
              loading={teamMembersCatalogQuery.isLoading}
              onChange={onAssigneeChange}
              teamMembersEnabled={teamMembersCatalogQuery.pluginEnabled}
              value={assigneeValue}
            />

            <Card variant="form">
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

            <TaskPlanningLine
              disabled={fieldsDisabled}
              onDueDateChange={onDueDateChange}
              onPriorityChange={onPriorityChange}
              task={task}
            />

            {runObserverError ? (
              <p className="text-destructive text-sm" role="alert">
                {runObserverError}
              </p>
            ) : null}

            <TaskCommentsActivityTabs
              activity={activity ?? []}
              assigneeProfiles={assigneeProfiles}
              commentDraft={commentDraft}
              // Decisions land at the end of the thread they belong to: the
              // agent's "waiting for you" comment is immediately followed by
              // the buttons that answer it.
              decisionSlot={
                <>
                  {/* A question outranks review: the run stopped mid-work and
                      cannot be judged until it is answered. */}
                  <TaskQuestionCard
                    disabled={fieldsDisabled}
                    onAnswer={(content) => answerMutation.mutateAsync(content)}
                    task={task}
                  />
                  <TaskReviewCard
                    disabled={fieldsDisabled || commentMutation.isPending}
                    onComment={async (content) => {
                      await commentMutation.mutateAsync(content);
                    }}
                    onStatusChange={onStatusChange}
                    task={task}
                  />
                  <TaskPendingApprovalCard task={task} />
                  <TaskFieldSuggestionsCard
                    disabled={fieldsDisabled}
                    runs={runs}
                    taskId={task.id}
                  />
                </>
              }
              disabled={commentMutation.isPending}
              onAddComment={() => void handleAddComment()}
              onCommentDraftChange={onCommentDraftChange}
              posting={commentMutation.isPending}
              runs={runs}
              runsSlot={
                <LiveTaskRunsPanel
                  activity={activity ?? []}
                  assigneeProfiles={assigneeProfiles}
                  disabled={releaseMutation.isPending}
                  onRelease={(run) =>
                    void releaseMutation.mutateAsync({
                      agent_session_run_id: run.agent_session_run_id,
                    })
                  }
                  onViewRun={(run) => void viewRun(run, { runs })}
                  releasing={releaseMutation.isPending}
                  runs={runs}
                />
              }
              scrollRootRef={scrollRootRef}
              statusDefinitions={taskStatusDefinitions}
              task={task}
            />
          </main>
          <TaskContextBox
            className="sticky top-4 hidden lg:flex"
            hostKey={ENGENTY_COPILOT_HOST_KEY}
            sessions={linkedSessionsQuery.data ?? []}
            sessionsLoading={linkedSessionsQuery.isLoading}
            task={task}
          />
        </div>
      </section>
    </div>
  );
}

export function TaskDetailPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const [approvedToolsOpen, setApprovedToolsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const scrollRootRef = useRef<HTMLElement>(null);
  const startWorkActionRef = useRef<(() => void) | null>(null);
  const taskId = id ?? "";
  const [observerPollLive, setObserverPollLive] = useState(false);
  const { currentTenant, currentUserId } = useWorkspaceContext();

  const livePollWhen = useCallback(() => observerPollLive, [observerPollLive]);
  const registerStartWork = useCallback((action: (() => void) | null) => {
    startWorkActionRef.current = action;
  }, []);

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
  const answerMutation = useAnswerTaskQuestionMutation(id ?? "");
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
    actions:
      task && !detailQuery.isError ? (
        <>
          {task.primary_assignee_kind === "agent" ? (
            <Button
              className="gap-2"
              disabled={updateMutation.isPending}
              onClick={() => startWorkActionRef.current?.()}
              size="sm"
              variant="ai"
            >
              <Sparkles className="size-3.5 shrink-0" />
              {t("detail.workspace.workOnTask")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("detail.actionsMenu")}
                className={topbarIconButtonClassName}
                size="sm"
                variant="outline"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(task.approval_grants?.length ?? 0) > 0 ||
              (task.approval_grants_once?.length ?? 0) > 0 ? (
                <DropdownMenuItem onClick={() => setApprovedToolsOpen(true)}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {t("detail.approvedTools")}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete.action")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TaskContextToggle
            hostKey={ENGENTY_COPILOT_HOST_KEY}
            sessions={linkedSessionsQuery.data ?? []}
            sessionsLoading={linkedSessionsQuery.isLoading}
            task={task}
          />
          <ArtifactPaneToggle
            container={{ id: task.id, tier: "task" }}
            hostKey={ENGENTY_COPILOT_HOST_KEY}
          />
        </>
      ) : null,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
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
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-engenty-region="detail"
    >
      {error ? (
        <p className="p-page text-destructive text-sm">{error}</p>
      ) : detailQuery.isLoading || !task ? (
        <p className="p-page text-muted-foreground text-sm">…</p>
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
            answerMutation={answerMutation}
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
            onLocationChange={(patch) => {
              void saveTask(patch);
            }}
            onPriorityChange={(priority: TaskPriority) => {
              void saveTask({ priority });
            }}
            onStatusChange={(status) => {
              void saveTask({ status });
            }}
            onTitleBlur={handleTitleBlur}
            onTitleChange={setTitleDraft}
            registerStartWork={registerStartWork}
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

      {/* Task context rows and live run artifacts share this pane. */}
      <WorkspaceArtifactPane
        container={task ? { id: task.id, tier: "task" } : null}
        hostKey={ENGENTY_COPILOT_HOST_KEY}
      />

      <TaskApprovedToolsDialog
        disabled={updateMutation.isPending}
        onOpenChange={setApprovedToolsOpen}
        open={approvedToolsOpen}
        task={task}
      />

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
    </div>
  );
}
