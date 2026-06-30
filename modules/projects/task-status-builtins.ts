import type { ProjectTaskStatusDefinition } from "./src/schema/types.js";

/** These ids cannot be removed from settings (core workflow). */
export const TASK_STATUS_IDS_NON_DELETABLE = new Set([
  "todo",
  "in_progress",
  "done",
]);

/** Default workflow statuses (ids stored on linked tasks.status). Keep stable for migrations. */
export const BUILTIN_TASK_STATUS_DEFINITIONS: ProjectTaskStatusDefinition[] = [
  { id: "backlog", label: "Backlog", color: "slate", locked: false },
  { id: "todo", label: "To do", color: "blue", locked: true },
  { id: "in_progress", label: "In progress", color: "orange", locked: true },
  { id: "in_review", label: "In review", color: "purple", locked: false },
  { id: "request", label: "Request", color: "orange", locked: false },
  { id: "done", label: "Done", color: "green", locked: true },
  { id: "cancelled", label: "Cancelled", color: "zinc", locked: false },
  { id: "blocked", label: "Blocked", color: "red", locked: false },
];

/** Ids shipped as defaults; keys should stay stable for existing task rows. */
export const BUILTIN_TASK_STATUS_IDS = new Set(
  BUILTIN_TASK_STATUS_DEFINITIONS.map((d) => d.id)
);
