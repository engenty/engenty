import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "@engenty/i18n/ui";
import { Badge, Button } from "@engenty/ui-core";
import { Calendar, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectTaskStatusDefinition,
} from "../api.js";
import { TaskCard } from "./task-card.js";

interface PhaseSectionProps {
  onAddTask?: (phaseId: string) => void;
  onPhaseEdit?: (phase: ProjectPhase & { tasks: PhaseTask[] }) => void;
  onPhaseVisibilityToggle?: (phaseId: string, is_public: boolean) => void;
  onRefresh?: () => void;
  onTaskDelete?: (taskId: string) => void;
  onTaskEdit?: (task: PhaseTask) => void;
  onTaskStatusChange?: (taskId: string, status: string) => void;
  onTaskVisibilityToggle?: (taskId: string, is_public: boolean) => void;
  phase: ProjectPhase & { tasks: PhaseTask[] };
  projectId: string;
  showAssignees?: boolean;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
  viewMode?: "internal" | "external";
}

export function PhaseSection({
  phase,
  projectId,
  onPhaseEdit,
  onAddTask,
  onTaskStatusChange,
  onTaskEdit,
  onTaskDelete,
  onPhaseVisibilityToggle,
  onTaskVisibilityToggle,
  showAssignees = true,
  viewMode = "internal",
  taskStatusDefinitions,
}: PhaseSectionProps) {
  const { t } = useTranslation("projects");
  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString() : null;
  const dateRange =
    phase.start_date && phase.end_date
      ? `${formatDate(phase.start_date)} – ${formatDate(phase.end_date)}`
      : null;

  const { setNodeRef } = useDroppable({ id: `phase-${phase.id}` });

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="group/phase flex items-center gap-2">
          <h3 className="font-medium text-lg">{phase.title}</h3>
          {phase.is_main && <Badge variant="outline">Main</Badge>}
          {viewMode === "internal" && onPhaseVisibilityToggle && (
            <Button
              className="h-8 w-8 p-0"
              onClick={() =>
                onPhaseVisibilityToggle(phase.id, !phase.is_public)
              }
              size="sm"
              title={
                phase.is_public ? "Visible to client" : "Hidden from client"
              }
              variant="ghost"
            >
              {phase.is_public ? (
                <Eye className="h-4 w-4 text-green-600" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
          {viewMode === "internal" && onPhaseEdit && (
            <Button
              aria-label={t("detail.edit")}
              className="h-8 w-8 p-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/phase:opacity-100"
              onClick={() => onPhaseEdit(phase)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        {dateRange && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="h-4 w-4" />
            <span>{dateRange}</span>
          </div>
        )}
      </div>
      <div className="min-h-[50px]" ref={setNodeRef}>
        <SortableContext
          items={phase.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {phase.tasks.map((task) => (
              <TaskCard
                key={task.id}
                onDelete={onTaskDelete}
                onEdit={onTaskEdit}
                onStatusChange={onTaskStatusChange}
                onVisibilityToggle={onTaskVisibilityToggle}
                showAssignees={showAssignees}
                showVisibility={viewMode === "internal"}
                task={task}
                taskStatusDefinitions={taskStatusDefinitions}
                viewMode={viewMode}
              />
            ))}
            {viewMode === "internal" && onAddTask ? (
              <Button
                className="h-auto justify-start px-3 py-1.5 pl-8 text-muted-foreground"
                onClick={() => onAddTask(phase.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Plus className="mr-1 h-4 w-4" />
                {t("detail.addTask")}
              </Button>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
