// Public cross-module surface for creating a task with the tasks module's
// own dialog (projects opens it with the project fixed).
// biome-ignore lint/performance/noBarrelFile: intentional package export entry
export { NewTaskDialog } from "./components/new-task-dialog.js";
export type { TaskFormSubmitData } from "./components/task-form-dialog.js";
export { useCreateTaskMutation } from "./tasks-queries.js";
