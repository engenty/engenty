import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SidePanel,
  SidePanelContent,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelTitle,
} from "@engenty/ui-core";
import { useCallback, useEffect, useState } from "react";
import { BUILTIN_TASK_STATUS_DEFINITIONS } from "../../task-status-builtins.js";
import type { ProjectListItem } from "../api.js";
import { createTask, getProject } from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { useProjectSettings } from "../queries.js";
import { TaskFormDialog } from "./task-form-dialog.js";

interface CreateTaskDialogProps {
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  open: boolean;
  projects: ProjectListItem[];
  teamMembersCatalog: TeamMemberCatalogRow[];
  teamMembersEnabled?: boolean;
  teamMembersError?: string | null;
  teamMembersLoading?: boolean;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onSuccess,
  projects,
  teamMembersCatalog,
  teamMembersEnabled = false,
  teamMembersError = null,
  teamMembersLoading = false,
}: CreateTaskDialogProps) {
  const { t } = useTranslation("projects");
  const [projectId, setProjectId] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const projectDetailQuery = useQuery({
    queryKey: ["projects", "detail", projectId],
    queryFn: ({ signal }) => getProject(projectId, signal),
    enabled: formOpen && Boolean(projectId),
  });

  const projectSettingsQuery = useProjectSettings();
  const taskStatusDefinitions =
    projectSettingsQuery.data?.task_status_definitions ??
    BUILTIN_TASK_STATUS_DEFINITIONS;

  const projectMemberIds =
    projectDetailQuery.data?.project_team?.map((m) => m.user_id) ?? [];

  useEffect(() => {
    if (!open) {
      setProjectId("");
      setFormOpen(false);
    }
  }, [open]);

  const handleProjectSelect = useCallback(() => {
    if (projectId) {
      setFormOpen(true);
    }
  }, [projectId]);

  const handleSubmit = useCallback(
    async (data: {
      title: string;
      content: string | null;
      status: string;
      is_public: boolean;
      phase_id?: string | null;
      discipline?: string | null;
      hours?: number | null;
      team_member_ids?: string[];
    }) => {
      if (!projectId) {
        return;
      }
      await createTask(projectId, {
        ...data,
        phase_id: data.phase_id ?? null,
      });
      onOpenChange(false);
      onSuccess();
    },
    [projectId, onOpenChange, onSuccess]
  );

  return (
    <>
      <SidePanel onOpenChange={onOpenChange} open={open && !formOpen}>
        <SidePanelContent className="sm:max-w-md">
          <SidePanelHeader>
            <SidePanelTitle>{t("tasks.addTask")}</SidePanelTitle>
          </SidePanelHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <Label htmlFor="create-task-project">
                {t("create.projectTitle")}
              </Label>
              <Select
                onValueChange={(v) => setProjectId(v === "__none__" ? "" : v)}
                value={projectId || "__none__"}
              >
                <SelectTrigger className="mt-1" id="create-task-project">
                  <SelectValue placeholder={t("tasks.selectProject")}>
                    {projectId
                      ? (projects.find((p) => p.id === projectId)?.title ??
                        projectId)
                      : t("tasks.selectProject")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("tasks.selectProject")}
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <SidePanelFooter>
              <Button
                disabled={!projectId}
                onClick={handleProjectSelect}
                type="button"
              >
                {t("detail.addTask")}
              </Button>
            </SidePanelFooter>
          </div>
        </SidePanelContent>
      </SidePanel>
      <TaskFormDialog
        onOpenChange={(isOpen) => {
          setFormOpen(isOpen);
          if (!isOpen) {
            onOpenChange(false);
          }
        }}
        onSubmit={handleSubmit}
        open={formOpen}
        phaseId={null}
        projectMemberIds={projectMemberIds}
        taskStatusDefinitions={taskStatusDefinitions}
        teamMembersCatalog={teamMembersCatalog}
        teamMembersEnabled={teamMembersEnabled}
        teamMembersError={teamMembersError}
        teamMembersLoading={teamMembersLoading}
      />
    </>
  );
}
