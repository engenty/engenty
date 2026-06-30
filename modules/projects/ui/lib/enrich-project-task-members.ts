import type { PhaseTask, ProjectWithPhasesAndTasks } from "../api.js";
import type { TeamMemberCatalogRow } from "../plugins.js";

/** Merge catalog names into task assignees for list/kanban/table views. */
export function enrichPhaseTasksWithCatalog<T extends PhaseTask>(
  tasks: readonly T[],
  catalog: TeamMemberCatalogRow[]
): T[] {
  if (catalog.length === 0) {
    return [...tasks];
  }
  const profileMap = new Map<
    string,
    {
      id: string;
      full_name: string;
      avatar_url: string | null;
      is_connected: boolean;
    }
  >();
  for (const c of catalog) {
    const prof = {
      id: c.user_id ?? c.id,
      full_name: c.full_name,
      avatar_url: null as string | null,
      is_connected: Boolean(c.user_id),
    };
    profileMap.set(c.id, prof);
    if (c.user_id) {
      profileMap.set(c.user_id, prof);
    }
  }
  return tasks.map((task) => ({
    ...task,
    task_team: task.task_team?.map((m) => {
      const prof = profileMap.get(m.user_id);
      return {
        ...m,
        profile: prof
          ? {
              ...prof,
              avatar_url: m.profile?.avatar_url ?? prof.avatar_url,
            }
          : m.profile,
      };
    }),
  }));
}

export function enrichProjectTaskMembers(
  project: ProjectWithPhasesAndTasks,
  catalog: TeamMemberCatalogRow[]
): void {
  if (catalog.length === 0) {
    return;
  }
  const profileMap = new Map<
    string,
    {
      id: string;
      full_name: string;
      avatar_url: string | null;
      is_connected: boolean;
    }
  >();
  for (const c of catalog) {
    const prof = {
      id: c.user_id ?? c.id,
      full_name: c.full_name,
      avatar_url: null as string | null,
      is_connected: Boolean(c.user_id),
    };
    profileMap.set(c.id, prof);
    if (c.user_id) {
      profileMap.set(c.user_id, prof);
    }
  }
  const apply = (task: PhaseTask) => {
    if (!task.task_team) {
      return;
    }
    for (const m of task.task_team) {
      const prof = profileMap.get(m.user_id);
      if (prof) {
        m.profile = prof;
      }
    }
  };
  for (const task of project.general_tasks) {
    apply(task);
  }
  for (const phase of project.phases) {
    for (const task of phase.tasks) {
      apply(task);
    }
  }
}
