import type { TaskStatusDefinition } from "./src/schema/types.js";

/**
 * These ids cannot be removed from settings — the dispatch / approval / review
 * state machine writes them by name (agent runs, blockers, resting backlog).
 * Tenants may still ADD custom statuses.
 */
export const TASK_STATUS_IDS_NON_DELETABLE = new Set([
  "todo",
  "in_progress",
  "done",
  "blocked",
  "in_review",
  "backlog",
  "cancelled",
]);

/** Default workflow statuses (ids are stored on tasks.status). */
export const BUILTIN_TASK_STATUS_DEFINITIONS: TaskStatusDefinition[] = [
  { id: "backlog", label: "Backlog", color: "slate", locked: true },
  { id: "todo", label: "To do", color: "blue", locked: true },
  { id: "in_progress", label: "In progress", color: "orange", locked: true },
  { id: "in_review", label: "In review", color: "purple", locked: true },
  { id: "request", label: "Request", color: "orange", locked: false },
  { id: "done", label: "Done", color: "green", locked: true },
  { id: "cancelled", label: "Cancelled", color: "zinc", locked: true },
  { id: "blocked", label: "Blocked", color: "red", locked: true },
];

export const BUILTIN_TASK_STATUS_IDS = new Set(
  BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => d.id)
);
