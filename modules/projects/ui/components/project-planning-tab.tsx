import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type useSensors,
} from "@dnd-kit/core";
import { useTranslation } from "@engenty/i18n/ui";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectTaskStatusDefinition,
  ProjectWithPhasesAndTasks,
} from "../api.js";
import { GeneralTasksSection } from "./general-tasks-section.js";
import { PhaseSection } from "./phase-section.js";
import { ProjectTimeplanSection } from "./project-timeplan-section.js";
import { TaskCard } from "./task-card.js";

interface ProjectPlanningTabProps {
  activeTask: PhaseTask | null;
  dateLocale?: string;
  filteredGeneralTasks: PhaseTask[];
  filteredPhases: (ProjectPhase & { tasks: PhaseTask[] })[];
  onAddTaskToPhase: (phaseId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  onPhaseCreate: (title: string) => Promise<string | null>;
  onPhaseEdit: (phase: ProjectPhase & { tasks: PhaseTask[] }) => void;
  onPhaseFormOpen: () => void;
  onPhaseTitleUpdate: (phaseId: string, title: string) => void | Promise<void>;
  onPhaseUpdate: (
    phaseId: string,
    startDate: string | null,
    endDate: string | null
  ) => void | Promise<void>;
  onPhaseVisibilityToggle: (phaseId: string, is_public: boolean) => void;
  onTaskAdd: () => void;
  onTaskDelete: (taskId: string) => void;
  onTaskEdit: (task: PhaseTask, phaseId?: string) => void;
  onTaskStatusChange: (taskId: string, status: string) => void;
  onTaskVisibilityToggle: (taskId: string, is_public: boolean) => void;
  project: ProjectWithPhasesAndTasks;
  projectId: string;
  sensors: ReturnType<typeof useSensors>;
  taskStatusDefinitions: ProjectTaskStatusDefinition[];
  teamMembersEnabled: boolean;
  viewMode: "internal" | "external";
}

export function ProjectPlanningTab({
  project,
  projectId,
  filteredPhases,
  filteredGeneralTasks,
  viewMode,
  dateLocale,
  activeTask,
  onDragStart,
  onDragEnd,
  sensors,
  onPhaseCreate,
  onPhaseTitleUpdate,
  onPhaseUpdate,
  onPhaseFormOpen,
  onPhaseEdit,
  onAddTaskToPhase,
  onTaskAdd,
  onTaskEdit,
  onTaskDelete,
  onTaskStatusChange,
  onTaskVisibilityToggle,
  onPhaseVisibilityToggle,
  teamMembersEnabled,
  taskStatusDefinitions,
}: ProjectPlanningTabProps) {
  const { t } = useTranslation("projects");
  const timeplanEnabled = project.timeplan_enabled !== false;

  // "Visible to the client" only means something while the client portal is
  // on — without it there is no one to hide anything from.
  const portalVisibility = project.portal_enabled;

  return (
    <DndContext
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <div className="mt-0 space-y-6">
        {/* Lean projects (`timeplan_enabled === false`) are rooms for notes,
            files and tasks - no dates, phases or Gantt on the main page. */}
        {timeplanEnabled && (
          <ProjectTimeplanSection
            collapsible
            dateLocale={dateLocale}
            endDate={project.end_date}
            onPhaseCreate={onPhaseCreate}
            onPhaseFormOpen={onPhaseFormOpen}
            onPhaseTitleUpdate={onPhaseTitleUpdate}
            onPhaseUpdate={onPhaseUpdate}
            phases={filteredPhases}
            startDate={project.start_date}
            viewMode={viewMode}
          />
        )}

        <GeneralTasksSection
          onAddTask={onTaskAdd}
          onTaskDelete={onTaskDelete}
          onTaskEdit={(task) => onTaskEdit(task)}
          onTaskStatusChange={onTaskStatusChange}
          onTaskVisibilityToggle={
            portalVisibility ? onTaskVisibilityToggle : undefined
          }
          showAssignees={teamMembersEnabled}
          taskStatusDefinitions={taskStatusDefinitions}
          tasks={filteredGeneralTasks}
          viewMode={viewMode}
        />

        {filteredPhases.map((phase) => (
          <PhaseSection
            key={phase.id}
            onAddTask={viewMode === "internal" ? onAddTaskToPhase : undefined}
            onPhaseEdit={viewMode === "internal" ? onPhaseEdit : undefined}
            onPhaseVisibilityToggle={
              portalVisibility ? onPhaseVisibilityToggle : undefined
            }
            onTaskDelete={onTaskDelete}
            onTaskEdit={(task) => onTaskEdit(task, phase.id)}
            onTaskStatusChange={onTaskStatusChange}
            onTaskVisibilityToggle={
              portalVisibility ? onTaskVisibilityToggle : undefined
            }
            phase={phase}
            projectId={projectId}
            showAssignees={teamMembersEnabled}
            taskStatusDefinitions={taskStatusDefinitions}
            viewMode={viewMode}
          />
        ))}

        {filteredPhases.length === 0 && viewMode === "external" && (
          <p className="py-8 text-center text-muted-foreground">
            No public phases yet
          </p>
        )}
      </div>

      <DragOverlay>
        {activeTask ? (
          <div className="ui-card-raised overflow-hidden opacity-80">
            <TaskCard
              showAssignees={teamMembersEnabled}
              task={activeTask}
              taskStatusDefinitions={taskStatusDefinitions}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
