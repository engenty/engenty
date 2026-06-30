import { useTranslation } from "@engenty/i18n/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { GoalFormSubmitData } from "../components/goal-form-dialog.js";
import { GoalFormDialog } from "../components/goal-form-dialog.js";
import { NewTaskDialog } from "../components/new-task-dialog.js";
import type { TaskFormSubmitData } from "../components/task-form-dialog.js";
import { TasksTopbarActions } from "../components/tasks-topbar-actions.js";
import { tasksPaths } from "../lib/tasks-routes.js";
import {
  useCreateGoalMutation,
  useCreateTaskMutation,
  useTaskSettingsQuery,
} from "../tasks-queries.js";
import { useTeamMembersCatalogQuery } from "./use-team-catalog-query.js";

export function useTasksTopbarActions() {
  const { t } = useTranslation("tasks");
  const navigate = useNavigate();

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [createGoalId, setCreateGoalId] = useState<string | null>(null);

  const settingsQuery = useTaskSettingsQuery();
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const createTaskMutation = useCreateTaskMutation();
  const createGoalMutation = useCreateGoalMutation();

  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;
  const teamMembersEnabled = teamMembersCatalogQuery.pluginEnabled;

  const openCreateTask = useCallback((goalId?: string | null) => {
    setCreateGoalId(goalId ?? null);
    setCreateTaskOpen(true);
  }, []);

  const openCreateGoal = useCallback(() => {
    setCreateGoalOpen(true);
  }, []);

  const handleCreateTaskOpenChange = useCallback((open: boolean) => {
    setCreateTaskOpen(open);
    if (!open) {
      setCreateGoalId(null);
    }
  }, []);

  const handleCreateTaskSubmit = useCallback(
    async (data: TaskFormSubmitData) => {
      const created = await createTaskMutation.mutateAsync({
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        due_date: data.due_date,
        goal_id: data.goal_id,
        project_id: data.project_id,
        primary_assignee_kind: data.primary_assignee_kind,
        primary_assignee_user_id: data.primary_assignee_user_id,
        primary_assignee_agent_type_key: data.primary_assignee_agent_type_key,
        collaborator_user_ids: data.collaborator_user_ids,
      });
      setCreateTaskOpen(false);
      setCreateGoalId(null);
      navigate(tasksPaths.taskDetail(created.id));
    },
    [createTaskMutation, navigate]
  );

  const handleCreateGoalSubmit = useCallback(
    async (data: GoalFormSubmitData) => {
      const created = await createGoalMutation.mutateAsync({
        title: data.title,
        description: data.description,
        status: data.status,
        target_date: data.target_date,
        project_id: data.project_id,
        owner_user_id: data.owner_user_id,
      });
      setCreateGoalOpen(false);
      navigate(tasksPaths.goalDetail(created.id));
    },
    [createGoalMutation, navigate]
  );

  const pageActions = useMemo(
    () => (
      <TasksTopbarActions
        addNewLabel={t("addNew")}
        newGoalLabel={t("goals.newGoal")}
        newTaskLabel={t("list.newTask")}
        onCreateGoal={openCreateGoal}
        onCreateTask={() => openCreateTask(null)}
        onOpenSettings={() => navigate(tasksPaths.settings)}
        settingsLabel={t("sidebar.settings")}
      />
    ),
    [navigate, openCreateGoal, openCreateTask, t]
  );

  const topbarDialogs = (
    <>
      <NewTaskDialog
        defaultGoalId={createGoalId}
        onOpenChange={handleCreateTaskOpenChange}
        onSubmit={handleCreateTaskSubmit}
        open={createTaskOpen}
        taskStatusDefinitions={taskStatusDefinitions}
        teamMembersCatalog={teamMembersCatalogQuery.data ?? []}
        teamMembersEnabled={teamMembersEnabled}
      />
      <GoalFormDialog
        onOpenChange={setCreateGoalOpen}
        onSubmit={handleCreateGoalSubmit}
        open={createGoalOpen}
        teamMembersCatalog={teamMembersCatalogQuery.data ?? []}
        teamMembersEnabled={teamMembersEnabled}
      />
    </>
  );

  return {
    openCreateGoal,
    openCreateTask,
    pageActions,
    topbarDialogs,
  };
}
