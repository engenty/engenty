import { useTranslation } from "@engenty/i18n/ui";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import { NewTaskDialog } from "../components/new-task-dialog.js";
import type { TaskFormSubmitData } from "../components/task-form-dialog.js";
import { TasksTopbarActions } from "../components/tasks-topbar-actions.js";
import { useTasksPaths } from "../lib/use-tasks-paths.js";
import {
  useCreateTaskMutation,
  useTaskSettingsQuery,
} from "../tasks-queries.js";
import { useTeamMembersCatalogQuery } from "./use-team-catalog-query.js";

export function useTasksTopbarActions() {
  const { t } = useTranslation("tasks");
  const navigate = useNavigate();
  const tasksPaths = useTasksPaths();

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createAgentTypeKey, setCreateAgentTypeKey] = useState<string | null>(
    null
  );

  const settingsQuery = useTaskSettingsQuery();
  const teamMembersCatalogQuery = useTeamMembersCatalogQuery();
  const createTaskMutation = useCreateTaskMutation();

  const taskStatusDefinitions =
    settingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;
  const teamMembersEnabled = teamMembersCatalogQuery.pluginEnabled;

  const openCreateTask = useCallback((agentTypeKey?: string | null) => {
    setCreateAgentTypeKey(agentTypeKey?.trim() || null);
    setCreateTaskOpen(true);
  }, []);

  const handleCreateTaskOpenChange = useCallback((open: boolean) => {
    setCreateTaskOpen(open);
    if (!open) {
      setCreateAgentTypeKey(null);
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
        project_id: data.project_id,
        primary_assignee_kind: data.primary_assignee_kind,
        primary_assignee_user_id: data.primary_assignee_user_id,
        primary_assignee_agent_type_key: data.primary_assignee_agent_type_key,
        collaborator_user_ids: data.collaborator_user_ids,
        // The phase rides in the project context's metadata — that is where
        // the projects module groups tasks into phases.
        ...(data.project_id && data.phase_id
          ? {
              contexts: [
                {
                  context_id: data.project_id,
                  context_type: "project",
                  metadata: { phase_id: data.phase_id },
                },
              ],
            }
          : {}),
      });
      setCreateTaskOpen(false);
      setCreateAgentTypeKey(null);
      navigate(tasksPaths.taskDetail(created.id));
    },
    [createTaskMutation, navigate, tasksPaths]
  );

  const pageActions = useMemo(
    () => (
      <TasksTopbarActions
        addNewLabel={t("addNew")}
        newTaskLabel={t("list.newTask")}
        onCreateTask={() => openCreateTask()}
        onOpenSettings={() => navigate(tasksPaths.settings)}
        settingsLabel={t("sidebar.settings")}
      />
    ),
    [navigate, openCreateTask, t, tasksPaths]
  );

  const topbarDialogs = (
    <NewTaskDialog
      defaultAgentTypeKey={createAgentTypeKey}
      onOpenChange={handleCreateTaskOpenChange}
      onSubmit={handleCreateTaskSubmit}
      open={createTaskOpen}
      taskStatusDefinitions={taskStatusDefinitions}
      teamMembersCatalog={teamMembersCatalogQuery.data ?? []}
      teamMembersEnabled={teamMembersEnabled}
    />
  );

  return {
    openCreateTask,
    pageActions,
    topbarDialogs,
  };
}
