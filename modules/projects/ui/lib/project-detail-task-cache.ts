import type {
  PhaseTask,
  ProjectWithPhasesAndTasks,
  TaskTeamMember,
} from "../api.js";

/**
 * Immutable reducers over the project-detail document. Tasks live in two kinds
 * of bucket — `general_tasks` (`phase_id === null`) and each phase's `tasks` —
 * and the API returns every bucket sorted by `order_index`, so these keep that
 * invariant after every edit.
 *
 * Every reducer returns the identical object when nothing matched. The cache
 * transaction in `beginOptimisticUpdate` compares references to decide whether
 * it still owns the cached value, and React needs a new root only when
 * something actually changed.
 */

export type ProjectTaskCreateInput = Omit<
  PhaseTask,
  "id" | "project_id" | "created_at" | "updated_at" | "task_team"
> & { team_member_ids?: string[] };

export type ProjectTaskPatch = Partial<
  Omit<PhaseTask, "id" | "project_id" | "created_at" | "updated_at">
> & { team_member_ids?: string[] };

function byOrderIndex(left: PhaseTask, right: PhaseTask): number {
  return left.order_index - right.order_index;
}

/**
 * Project a create input as a renderable row. `task_team` is derived from the
 * submitted member ids so `enrichProjectTaskMembers` can fill in names and
 * avatars from the team catalog before the server answers.
 */
export function optimisticPhaseTask(
  input: ProjectTaskCreateInput,
  projectId: string,
  id: string,
  now = new Date().toISOString()
): PhaseTask {
  const taskTeam: TaskTeamMember[] = (input.team_member_ids ?? []).map(
    (userId) => ({ task_id: id, user_id: userId })
  );
  return {
    content: input.content,
    created_at: now,
    discipline: input.discipline,
    hours: input.hours,
    id,
    is_public: input.is_public,
    order_index: input.order_index,
    phase_id: input.phase_id,
    project_id: projectId,
    status: input.status,
    task_team: taskTeam,
    title: input.title,
    updated_at: now,
  };
}

function withBucket(
  project: ProjectWithPhasesAndTasks,
  phaseId: string | null,
  next: (tasks: PhaseTask[]) => PhaseTask[]
): ProjectWithPhasesAndTasks {
  if (phaseId === null) {
    return { ...project, general_tasks: next(project.general_tasks) };
  }
  let touched = false;
  const phases = project.phases.map((phase) => {
    if (phase.id !== phaseId) {
      return phase;
    }
    touched = true;
    return { ...phase, tasks: next(phase.tasks) };
  });
  return touched ? { ...project, phases } : project;
}

function findTask(
  project: ProjectWithPhasesAndTasks,
  taskId: string
): { phaseId: string | null; task: PhaseTask } | null {
  const general = project.general_tasks.find((task) => task.id === taskId);
  if (general) {
    return { phaseId: null, task: general };
  }
  for (const phase of project.phases) {
    const task = phase.tasks.find((candidate) => candidate.id === taskId);
    if (task) {
      return { phaseId: phase.id, task };
    }
  }
  return null;
}

/** Add a task to the bucket named by its own `phase_id`. */
export function insertTask(
  project: ProjectWithPhasesAndTasks | undefined,
  task: PhaseTask
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  return withBucket(project, task.phase_id, (tasks) =>
    [...tasks, task].sort(byOrderIndex)
  );
}

/**
 * Apply a patch to one task, moving it between buckets when `phase_id`
 * changes. Unknown ids leave the document untouched.
 */
export function patchTask(
  project: ProjectWithPhasesAndTasks | undefined,
  taskId: string,
  patch: ProjectTaskPatch
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const found = findTask(project, taskId);
  if (!found) {
    return project;
  }

  const { team_member_ids, ...fields } = patch;
  // A patch carrying member ids wins; otherwise keep whichever team the patch
  // or the cached row already has — a server row brings its own `task_team`.
  const taskTeam =
    team_member_ids === undefined
      ? (fields.task_team ?? found.task.task_team)
      : team_member_ids.map((userId) => ({ task_id: taskId, user_id: userId }));
  const next: PhaseTask = { ...found.task, ...fields, task_team: taskTeam };

  if (next.phase_id === found.phaseId) {
    return withBucket(project, found.phaseId, (tasks) =>
      tasks.map((task) => (task.id === taskId ? next : task)).sort(byOrderIndex)
    );
  }

  const without = withBucket(project, found.phaseId, (tasks) =>
    tasks.filter((task) => task.id !== taskId)
  );
  return insertTask(without, next);
}

/** Rewrite one bucket's `order_index` values to match `orderedIds`. */
export function reorderTasks(
  project: ProjectWithPhasesAndTasks | undefined,
  phaseId: string | null,
  orderedIds: readonly string[]
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const rank = new Map(orderedIds.map((id, index) => [id, index]));
  return withBucket(project, phaseId, (tasks) =>
    tasks
      .map((task) => {
        const order = rank.get(task.id);
        return order === undefined || order === task.order_index
          ? task
          : { ...task, order_index: order };
      })
      .sort(byOrderIndex)
  );
}

/** Drop a task from whichever bucket holds it. */
export function removeTask(
  project: ProjectWithPhasesAndTasks | undefined,
  taskId: string
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  const found = findTask(project, taskId);
  if (!found) {
    return project;
  }
  return withBucket(project, found.phaseId, (tasks) =>
    tasks.filter((task) => task.id !== taskId)
  );
}

/**
 * Replace a temporary row with the saved one. When the temporary row is already
 * gone — a realtime refetch landed first — the saved row is inserted only if it
 * isn't in the document yet, so a create can never render twice.
 */
export function reconcileTask(
  project: ProjectWithPhasesAndTasks | undefined,
  optimisticId: string,
  saved: PhaseTask
): ProjectWithPhasesAndTasks | undefined {
  if (!project) {
    return project;
  }
  let next = project;
  const temporary = findTask(next, optimisticId);
  if (temporary) {
    next = withBucket(next, temporary.phaseId, (tasks) =>
      tasks.filter((task) => task.id !== optimisticId)
    );
  }
  const existing = findTask(next, saved.id);
  if (existing) {
    // A realtime refetch already delivered the saved row; leave it in place.
    return temporary ? next : project;
  }
  return insertTask(next, saved);
}
