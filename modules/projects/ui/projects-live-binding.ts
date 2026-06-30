import type { ModuleLiveBinding } from "@engenty/live-cache";
import { projectKeys } from "./queries.js";

/**
 * Reactive-data declaration for the projects module. Keeps the projects list /
 * detail queries fresh when data is written out-of-band — primarily by the
 * copilot agent's `manage_project*` tools, and (via the realtime layer) by any
 * other writer. Tool ids mirror the `*_TOOL_ID` constants in
 * `modules/projects/ai/tools/*` (kept as literals to avoid importing server-only
 * tool modules into the UI bundle).
 *
 * Project tasks live in `module_tasks` via the bridge, so changes there must also
 * invalidate the projects subtree: `tasks` (status/title) and `task_contexts`
 * (project link, order_index, discipline, visibility). `task_collaborators` has no
 * tenant_id, so assignee-only changes can't be tenant-filtered for realtime.
 */
export const projectsLiveBinding: ModuleLiveBinding = {
  id: "projects",
  queryRoot: projectKeys.all,
  agentToolIds: [
    "manage_project",
    "manage_project_phase",
    "manage_project_task",
  ],
  postgresChanges: [
    { schema: "module_projects", table: "projects" },
    { schema: "module_projects", table: "project_phases" },
    { schema: "module_tasks", table: "tasks" },
    { schema: "module_tasks", table: "task_contexts" },
  ],
};
