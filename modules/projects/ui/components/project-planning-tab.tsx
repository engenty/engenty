import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type useSensors,
} from "@dnd-kit/core";
import { useTranslation } from "@engenty/i18n/ui";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectTaskStatusDefinition,
  ProjectWithPhasesAndTasks,
} from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { GeneralTasksSection } from "./general-tasks-section.js";
import { PhaseSection } from "./phase-section.js";
import { ProjectBriefSection } from "./project-brief-section.js";
import { ProjectClientInfoSection } from "./project-client-info-section.js";
import { ProjectTeamMembersSection } from "./project-team-members-section.js";
import { ProjectTimeplanSection } from "./project-timeplan-section.js";
import { TaskCard } from "./task-card.js";

interface ProjectPlanningTabProps {
  activeTask: PhaseTask | null;
  dateLocale?: string;
  filteredGeneralTasks: PhaseTask[];
  filteredPhases: (ProjectPhase & { tasks: PhaseTask[] })[];
  loadProject: () => Promise<void>;
  onAddTaskToPhase: (phaseId: string) => void;
  onBriefingSave?: (briefing: string | null) => void | Promise<void>;
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: { active: { id: string } }) => void;
  onPhaseCreate: (title: string) => Promise<string | null>;
  onPhaseEdit: (phase: ProjectPhase & { tasks: PhaseTask[] }) => void;
  onPhaseFormOpen: () => void;
  onPhaseTitleUpdate: (phaseId: string, title: string) => Promise<void>;
  onPhaseUpdate: (
    phaseId: string,
    startDate: string | null,
    endDate: string | null
  ) => Promise<void>;
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
  teamMembersCatalog: TeamMemberCatalogRow[];
  teamMembersEnabled: boolean;
  teamMembersError?: string | null;
  teamMembersLoading?: boolean;
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
  teamMembersCatalog,
  teamMembersEnabled,
  teamMembersError = null,
  teamMembersLoading = false,
  loadProject,
  taskStatusDefinitions,
}: ProjectPlanningTabProps) {
  const { t } = useTranslation("projects");
  const timeplanEnabled = project.timeplan_enabled !== false;

  return (
    <DndContext
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <div className="mt-0 space-y-6">
        {onBriefingSave ? (
          <ProjectBriefSection
            briefing={project.briefing ?? null}
            disabled={viewMode === "external"}
            onSave={onBriefingSave}
          />
        ) : null}
        {teamMembersEnabled ? (
          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              {teamMembersLoading ? (
                <div className="rounded-lg border border-border/60 bg-card/50 p-3 text-muted-foreground text-sm">
                  {t("detail.members.loading")}
                </div>
              ) : teamMembersError ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm">
                  {teamMembersError}
                </div>
              ) : (
                <ProjectTeamMembersSection
                  catalog={teamMembersCatalog}
                  className="mt-0"
                  onProjectUpdated={() => void loadProject()}
                  projectId={project.id}
                  projectTeamMembers={project.project_team ?? []}
                />
              )}
            </div>
            <div className="min-w-0">
              <ProjectClientInfoSection
                className="mt-0"
                editable={viewMode === "internal"}
                onProjectUpdated={loadProject}
                project={project}
                projectId={projectId}
              />
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <ProjectClientInfoSection
              editable={viewMode === "internal"}
              onProjectUpdated={loadProject}
              project={project}
              projectId={projectId}
            />
          </div>
        )}

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
          onTaskVisibilityToggle={onTaskVisibilityToggle}
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
            onPhaseVisibilityToggle={onPhaseVisibilityToggle}
            onTaskDelete={onTaskDelete}
            onTaskEdit={(task) => onTaskEdit(task, phase.id)}
            onTaskStatusChange={onTaskStatusChange}
            onTaskVisibilityToggle={onTaskVisibilityToggle}
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
          <div className="opacity-80">
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
