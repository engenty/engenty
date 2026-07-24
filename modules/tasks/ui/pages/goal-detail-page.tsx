import { useCopilotShell } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
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
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { MoreVertical, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { GoalStatus } from "../../src/schema/types.js";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { GoalDocumentTitle } from "../components/goal-document-title.js";
import { GoalLinkedTasksSection } from "../components/goal-linked-tasks-section.js";
import { GoalPropertiesPanel } from "../components/goal-properties-panel.js";
import { GoalStatusBadge } from "../components/goal-status-badge.js";
import { useTasksGoalDetailAgentUiSlice } from "../hooks/use-tasks-agent-ui-slice.js";
import { useTasksModuleSecondaryShellNav } from "../hooks/use-tasks-module-secondary-shell-nav.js";
import { useTasksTopbarActions } from "../hooks/use-tasks-topbar-actions.js";
import { showTaskSaveErrorToast } from "../lib/task-lifecycle-ui.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import {
  useDeleteGoalMutation,
  useGoalDetailQuery,
  useHandoffGoalMutation,
  useTaskSettingsQuery,
  useTasksListQuery,
  useUpdateGoalMutation,
} from "../tasks-queries.js";

export function GoalDetailPage() {
  const { t } = useTranslation("tasks");
  const { setCopilotContext } = useCopilotShell();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");

  const goalQuery = useGoalDetailQuery(id ?? null);
  const settingsQuery = useTaskSettingsQuery();
  const updateMutation = useUpdateGoalMutation(id ?? "");
  const deleteMutation = useDeleteGoalMutation();
  const handoffMutation = useHandoffGoalMutation(id ?? "");
  const goal = goalQuery.data ?? null;

  const linkedTasksQuery = useTasksListQuery({
    goal_id: id ?? null,
    page: 1,
    pageSize: 100,
    sortBy: "updated_at",
    sortOrder: "desc",
  });

  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  useEffect(() => {
    if (!goal) {
      return;
    }
    setTitleDraft(goal.title);
    setDescriptionDraft(goal.description ?? "");
  }, [goal?.description, goal?.id, goal?.title]);

  const title = goal?.title ?? (titleDraft || "…");

  const { openCreateTask, topbarDialogs } = useTasksTopbarActions();
  const { moduleRootCrumb, secondaryNavAfterItems, secondaryNavHeaderSlot } =
    useTasksModuleSecondaryShellNav();

  const breadcrumbs = useMemo(
    () => [...(moduleRootCrumb ? [moduleRootCrumb] : []), { label: title }],
    [moduleRootCrumb, title]
  );

  usePageConfig({
    actions: goal ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={t("goals.detail.actionsMenu")}
            className={topbarIconButtonClassName}
            size="sm"
            variant="outline"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("goals.delete.action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null,
    breadcrumbs,
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const linkedTasks = linkedTasksQuery.data?.data ?? [];
  useTasksGoalDetailAgentUiSlice({ goal, linkedTasks });

  useEffect(() => {
    if (!goal) {
      return;
    }
    setCopilotContext({
      scope: {
        current_module: "tasks",
        currentModule: "tasks",
        entityId: goal.id,
        entity_id: goal.id,
        goal_id: goal.id,
        goal_title: goal.title,
        goal_status: goal.status,
      },
    });
    return () => setCopilotContext(null);
  }, [goal, setCopilotContext]);

  const error =
    goalQuery.error instanceof Error
      ? goalQuery.error.message
      : goalQuery.isError
        ? t("goals.detailLoadFailed")
        : null;

  const saveGoal = async (
    patch: Parameters<typeof updateMutation.mutateAsync>[0]
  ) => {
    try {
      await updateMutation.mutateAsync(patch);
    } catch (err) {
      showTaskSaveErrorToast(err, t, "goals.edit.saveFailed");
    }
  };

  const handleTitleBlur = () => {
    if (!goal) {
      return;
    }
    const trimmed = titleDraft.trim();
    if (!trimmed) {
      setTitleDraft(goal.title);
      return;
    }
    if (trimmed !== goal.title) {
      void saveGoal({ title: trimmed });
    }
  };

  const handleDescriptionBlur = () => {
    if (!goal) {
      return;
    }
    const nextDescription = descriptionDraft.trim() || null;
    const currentDescription = goal.description?.trim() || null;
    if (nextDescription !== currentDescription) {
      void saveGoal({ description: nextDescription });
    }
  };

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    await deleteMutation.mutateAsync(id);
    navigate(tasksPaths.goals);
  };

  const handleHandoff = async () => {
    if (!id) {
      return;
    }
    try {
      const result = await handoffMutation.mutateAsync();
      toast.success(
        result.dispatched
          ? t("goals.detail.handoffDispatched")
          : t("goals.detail.handoffAssigned")
      );
    } catch (err) {
      showTaskSaveErrorToast(err, t, "goals.detail.handoffFailed");
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-page pb-10">
      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : goalQuery.isLoading || !goal ? (
        <p className="text-muted-foreground text-sm">…</p>
      ) : (
        <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[1fr_minmax(280px,280px)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <GoalStatusBadge status={goal.status} />
              <GoalDocumentTitle
                disabled={updateMutation.isPending}
                onBlur={handleTitleBlur}
                onChange={setTitleDraft}
                placeholder={t("form.title")}
                value={titleDraft}
              />
            </div>

            <Card variant="form">
              <Textarea
                className="min-h-[120px] resize-y rounded-none border-0 bg-transparent px-0 py-0 shadow-none transition-colors hover:bg-input/25 focus-visible:border-transparent focus-visible:bg-input/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0"
                disabled={updateMutation.isPending}
                onBlur={handleDescriptionBlur}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder={t("goals.detail.descriptionPlaceholder")}
                rows={6}
                value={descriptionDraft}
              />
            </Card>

            <GoalLinkedTasksSection
              goalId={goal.id}
              linkedTasks={linkedTasks}
              linkedTasksLoading={linkedTasksQuery.isLoading}
              onCreateTask={openCreateTask}
              taskStatusDefinitions={taskStatusDefinitions}
            />
          </div>

          <GoalPropertiesPanel
            disabled={updateMutation.isPending}
            goal={goal}
            handoffPending={handoffMutation.isPending}
            onHandoffToCoordinator={() => void handleHandoff()}
            onOwnerChange={(change) => {
              void saveGoal(change);
            }}
            onStatusChange={(status: GoalStatus) => {
              void saveGoal({ status });
            }}
            onTargetDateChange={(targetDate) => {
              void saveGoal({ target_date: targetDate });
            }}
          />
        </div>
      )}

      {topbarDialogs}

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("goals.delete.confirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("goals.delete.confirmDescription", {
                title: goal?.title ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t("goals.edit.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => void handleDelete()}
            >
              {t("goals.delete.action")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
