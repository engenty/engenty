import type {
  PhaseTask,
  ProjectPhase,
  ProjectUpdateInput,
  ProjectWithPhasesAndTasks,
} from "../api.js";

/**
 * Immutable reducers for the phase and project-level halves of the
 * project-detail document. Task reducers live next door in
 * `project-detail-task-cache.ts`; both keep the same contract — the identical
 * object comes back when nothing matched.
 */

export type ProjectDetailPhase = ProjectWithPhasesAndTasks["phases"][number];

export type ProjectPhaseCreateInput = Omit<
  ProjectPhase,
  "id" | "project_id" | "created_at" | "updated_at"
>;

export type ProjectPhasePatch = Partial<ProjectPhase>;

function byOrderIndex(left: ProjectPhase, right: ProjectPhase): number {
  return left.order_index - right.order_index;
}

/**
 * The project's own dates mirror the phase min/max — `fetchProjectWithDateSync`
 * reconciles them on every fetch, so project them here too and the header moves
 * with the phase instead of waiting for the next refetch.
 */
function withSyncedDates(
  project: ProjectWithPhasesAndTasks
): ProjectWithPhasesAndTasks {
  let start: string | null = null;
  let end: string | null = null;
  for (const phase of project.phases) {
    for (const date of [phase.start_date, phase.end_date]) {
      if (!date) {
        continue;
      }
      if (!start || date < start) {
        start = date;
      }
      if (!end || date > end) {
        end = date;
      }
    }
  }
  return start === project.start_date && end === project.end_date
    ? project
    : { ...project, end_date: end, start_date: start };
}

export function optimisticPhase(
  input: ProjectPhaseCreateInput,
  projectId: string,
  id: string,
  now = new Date().toISOString()
): ProjectDetailPhase {
  return {
    created_at: now,
    end_date: input.end_date,
    id,
    is_main: input.is_main,
    is_public: input.is_public,
    order_index: input.order_index,
    project_id: projectId,
    start_date: input.start_date,
    tasks: [],
    title: input.title,
    updated_at: now,
  };
}

export function insertPhase(
  project: ProjectWithPhasesAndTasks | undefined,
  phase: ProjectDetailPhase
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  return withSyncedDates({
    ...project,
    phases: [...project.phases, phase].sort(byOrderIndex),
  });
}

export function patchPhase(
  project: ProjectWithPhasesAndTasks | undefined,
  phaseId: string,
  patch: ProjectPhasePatch
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  if (!project.phases.some((phase) => phase.id === phaseId)) {
    return project;
  }
  return withSyncedDates({
    ...project,
    // A saved phase carries no tasks, so the cached ones are kept.
    phases: project.phases
      .map((phase) =>
        phase.id === phaseId
          ? { ...phase, ...patch, tasks: phase.tasks }
          : phase
      )
      .sort(byOrderIndex),
  });
}

/**
 * Remove a phase and settle its tasks the way the caller settles them on the
 * server: `move` reparents them to another bucket, `delete` drops them.
 */
export function removePhase(
  project: ProjectWithPhasesAndTasks | undefined,
  phaseId: string,
  taskAction:
    | { kind: "delete" }
    | { kind: "move"; targetPhaseId: string | null }
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const removed = project.phases.find((phase) => phase.id === phaseId);
  if (!removed) {
    return project;
  }

  const phases = project.phases.filter((phase) => phase.id !== phaseId);
  if (taskAction.kind === "delete") {
    return withSyncedDates({ ...project, phases });
  }

  const moved: PhaseTask[] = removed.tasks.map((task) => ({
    ...task,
    phase_id: taskAction.targetPhaseId,
  }));
  if (taskAction.targetPhaseId === null) {
    return withSyncedDates({
      ...project,
      general_tasks: [...project.general_tasks, ...moved],
      phases,
    });
  }
  return withSyncedDates({
    ...project,
    phases: phases.map((phase) =>
      phase.id === taskAction.targetPhaseId
        ? { ...phase, tasks: [...phase.tasks, ...moved] }
        : phase
    ),
  });
}

export function reconcilePhase(
  project: ProjectWithPhasesAndTasks | undefined,
  optimisticId: string,
  saved: ProjectPhase
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const temporary = project.phases.find((phase) => phase.id === optimisticId);
  if (!temporary) {
    return project.phases.some((phase) => phase.id === saved.id)
      ? project
      : insertPhase(project, { ...saved, tasks: [] });
  }
  return withSyncedDates({
    ...project,
    phases: project.phases
      .filter((phase) => phase.id !== saved.id)
      .map((phase) =>
        phase.id === optimisticId ? { ...saved, tasks: temporary.tasks } : phase
      )
      .sort(byOrderIndex),
  });
}

/**
 * Project-level field edits (settings, briefing). The API answers with the
 * project row alone, so only its own fields are merged — phases and general
 * tasks stay as the document has them.
 */
export function patchProject(
  project: ProjectWithPhasesAndTasks | undefined,
  patch: ProjectUpdateInput
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const {
    // Write-only inputs that the detail document does not carry.
    team_member_ids: _members,
    project_team: _team,
    portal_password: _password,
    ...fields
  } = patch;
  return { ...project, ...fields };
}
