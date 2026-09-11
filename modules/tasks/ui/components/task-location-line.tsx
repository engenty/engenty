import { requestApiEnvelope } from "@engenty/api-client";
import { useTranslation } from "@engenty/i18n/ui";
import { useQuery } from "@engenty/query-client";
import { Popover, PopoverContent, PopoverTrigger } from "@engenty/ui-core";
import { FolderKanban, Layers } from "lucide-react";
import { useMemo, useState } from "react";
import type { TaskDetail, TaskUpdateInput } from "../../src/schema/types.js";
import { useProjectsMinimalQuery } from "../hooks/use-projects-minimal-query.js";
import {
  buildTaskLocationPatch,
  taskProjectPhaseId,
} from "../lib/task-location.js";
import {
  PhaseSelectorContent,
  ProjectSelectorContent,
  pillClass,
} from "./new-task-selectors.js";

interface ProjectPhaseItem {
  id: string;
  order_index: number;
  title: string;
}

function useProjectPhasesQuery(projectId: string | null) {
  return useQuery({
    enabled: Boolean(projectId),
    queryKey: ["projects", "phases", projectId],
    queryFn: async ({ signal }) => {
      const res = await requestApiEnvelope<{ phases?: ProjectPhaseItem[] }>(
        `/api/projects/${projectId}`,
        { method: "GET", signal }
      );
      return [...(res.data?.phases ?? [])].sort(
        (a, b) => a.order_index - b.order_index
      );
    },
    staleTime: 60_000,
  });
}

interface TaskLocationLineProps {
  disabled?: boolean;
  onChange: (patch: TaskUpdateInput) => void;
  task: TaskDetail;
}

export function TaskLocationLine({
  disabled,
  onChange,
  task,
}: TaskLocationLineProps) {
  const { t } = useTranslation("tasks");
  const [projectOpen, setProjectOpen] = useState(false);
  const [phaseOpen, setPhaseOpen] = useState(false);
  const projectsQuery = useProjectsMinimalQuery();
  const projects = projectsQuery.data ?? [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === task.project_id) ?? null,
    [projects, task.project_id]
  );
  const phaseId = taskProjectPhaseId(task);
  const phasesQuery = useProjectPhasesQuery(task.project_id);
  const phases = phasesQuery.data ?? [];
  const selectedPhase = useMemo(
    () => phases.find((phase) => phase.id === phaseId) ?? null,
    [phaseId, phases]
  );
  const triggerClassName = `${pillClass} disabled:cursor-default disabled:opacity-60`;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
      <Popover modal={false} onOpenChange={setProjectOpen} open={projectOpen}>
        <PopoverTrigger asChild>
          <button
            className={triggerClassName}
            disabled={disabled}
            type="button"
          >
            <FolderKanban className="h-3 w-3 shrink-0" />
            <span
              className={
                selectedProject ? "max-w-[160px] truncate text-foreground" : ""
              }
            >
              {selectedProject?.title ?? t("newTask.projectPlaceholder")}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <ProjectSelectorContent
            onSelect={(projectId) => {
              onChange(
                buildTaskLocationPatch(task, { phaseId: null, projectId })
              );
              setProjectOpen(false);
            }}
            projectId={task.project_id}
            projects={projects}
          />
        </PopoverContent>
      </Popover>

      {task.project_id ? (
        <>
          <span>{t("newTask.inLabel")}</span>
          <Popover modal={false} onOpenChange={setPhaseOpen} open={phaseOpen}>
            <PopoverTrigger asChild>
              <button
                className={triggerClassName}
                disabled={disabled}
                type="button"
              >
                <Layers className="h-3 w-3 shrink-0" />
                <span
                  className={
                    selectedPhase
                      ? "max-w-[160px] truncate text-foreground"
                      : ""
                  }
                >
                  {selectedPhase?.title ?? t("newTask.phasePlaceholder")}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <PhaseSelectorContent
                noPhaseLabel={t("newTask.noPhase")}
                onSelect={(nextPhaseId) => {
                  onChange(
                    buildTaskLocationPatch(task, {
                      phaseId: nextPhaseId,
                      projectId: task.project_id,
                    })
                  );
                  setPhaseOpen(false);
                }}
                phaseId={phaseId}
                phases={phases}
                searchPlaceholder={t("newTask.searchPhases")}
              />
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
}
