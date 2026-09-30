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
import {
  hasBriefingText,
  ProjectBriefSection,
} from "./project-brief-section.js";
import { ProjectTimeplanSection } from "./project-timeplan-section.js";
import { TaskCard } from "./task-card.js";

interface ProjectPlanningTabProps {
  activeTask: PhaseTask | null;
  dateLocale?: string;
  filteredGeneralTasks: PhaseTask[];
  filteredPhases: (ProjectPhase & { tasks: PhaseTask[] })[];
  onAddTaskToPhase: (phaseId: string) => void;
  onBriefingSave?: (briefing: string | null) => void | Promise<void>;
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
  onViewNotes?: () => void;
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
  onBriefingSave,
  onPhaseVisibilityToggle,
  onViewNotes,
  teamMembersEnabled,
  taskStatusDefinitions,
}: ProjectPlanningTabProps) {
  const { t } = useTranslation("projects");
  const timeplanEnabled = project.timeplan_enabled !== false;

  const internal = viewMode === "internal";
  // "Visible to the client" only means something while the client portal is
  // on — without it there is no one to hide anything from.
  const portalVisibility = project.portal_enabled;
  const hasNotes = hasBriefingText(project.briefing ?? null);
  const emptyLinks = [
    onBriefingSave && !hasNotes && internal && onViewNotes ? (
      <ProjectBriefSection
        briefing={null}
        key="notes"
        onSave={onBriefingSave}
        onViewNotes={onViewNotes}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <DndContext
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <div className="mt-0 space-y-6">
        {/* Notes still missing is a quiet "+ …" link; it becomes the full
            section once it has content. Client and team live in the header
            and the settings sidebar. */}
        {emptyLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 [&>*]:flex [&>*]:items-center">
            {emptyLinks}
          </div>
        ) : null}
        {onBriefingSave && hasNotes ? (
          <ProjectBriefSection
            briefing={project.briefing ?? null}
            disabled={viewMode === "external"}
            onSave={onBriefingSave}
            onViewNotes={onViewNotes}
          />
        ) : null}
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
