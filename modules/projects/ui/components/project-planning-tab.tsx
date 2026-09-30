import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type useSensors,
} from "@dnd-kit/core";
import { useTranslation } from "@engenty/i18n/ui";
import { cn } from "@engenty/ui-core";
import type {
  PhaseTask,
  ProjectPhase,
  ProjectTaskStatusDefinition,
  ProjectWithPhasesAndTasks,
} from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";
import { GeneralTasksSection } from "./general-tasks-section.js";
import { PhaseSection } from "./phase-section.js";
import {
  hasBriefingText,
  ProjectBriefSection,
} from "./project-brief-section.js";
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
  onViewNotes,
  teamMembersCatalog,
  teamMembersEnabled,
  teamMembersError = null,
  teamMembersLoading = false,
  loadProject,
  taskStatusDefinitions,
}: ProjectPlanningTabProps) {
  const { t } = useTranslation("projects");
  const timeplanEnabled = project.timeplan_enabled !== false;

  const internal = viewMode === "internal";
  // "Visible to the client" only means something while the client portal is
  // on — without it there is no one to hide anything from.
  const portalVisibility = project.portal_enabled;
  const hasNotes = hasBriefingText(project.briefing ?? null);
  const hasTeam = (project.project_team ?? []).length > 0;
  const hasClient = Boolean(
    project.client_id?.trim() || project.client_name?.trim()
  );

  const teamSection = teamMembersLoading ? (
    <div className="rounded-lg border border-border-soft bg-card/50 p-3 text-muted-foreground text-sm">
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
      emptyAs={hasTeam ? "section" : "link"}
      onProjectUpdated={() => void loadProject()}
      projectId={project.id}
      projectTeamMembers={project.project_team ?? []}
    />
  );
  const clientSection = (
    <ProjectClientInfoSection
      className="mt-0"
      editable={internal}
      emptyAs={hasClient ? "section" : "link"}
      onProjectUpdated={loadProject}
      project={project}
      projectId={projectId}
    />
  );

  const emptyLinks = [
    onBriefingSave && !hasNotes && internal && onViewNotes ? (
      <ProjectBriefSection
        briefing={null}
        key="notes"
        onSave={onBriefingSave}
        onViewNotes={onViewNotes}
      />
    ) : null,
    teamMembersEnabled && !hasTeam && internal ? (
      <div key="team">{teamSection}</div>
    ) : null,
    !hasClient && internal ? <div key="client">{clientSection}</div> : null,
  ].filter(Boolean);

  const filledSections = [
    teamMembersEnabled && hasTeam ? (
      <div className="min-w-0" key="team">
        {teamSection}
      </div>
    ) : null,
    hasClient ? (
      <div className="min-w-0" key="client">
        {clientSection}
      </div>
    ) : null,
  ].filter(Boolean);

  return (
    <DndContext
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      <div className="mt-0 space-y-6">
        {/* What is still missing (notes, team, client) is one quiet row of
            "+ …" links; each becomes its full section once it has content. */}
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
        {filledSections.length > 0 ? (
          <div
            className={cn(
              "grid grid-cols-1 gap-8 lg:items-start",
              filledSections.length > 1 && "lg:grid-cols-2"
            )}
          >
            {filledSections}
          </div>
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
