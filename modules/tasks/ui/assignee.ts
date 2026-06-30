// Public cross-module assignee surface for projects and other task consumers.
// biome-ignore lint/performance/noBarrelFile: intentional package export entry
export { TaskCard } from "./components/task-card.js";
export {
  TaskCollaboratorsPicker,
  type TaskCollaboratorsPickerProps,
} from "./components/task-collaborators-picker.js";
export { TasksGroupedList } from "./components/tasks-grouped-list.js";
export { TeamMemberTasksTab } from "./components/team-member-tasks-tab.js";
export {
  teamMembersCatalogQueryKey,
  teamMembersCatalogQueryOptions,
  useTeamMembersCatalogQuery,
} from "./hooks/use-team-catalog-query.js";
export {
  buildTaskAssigneeMemberOptions,
  teamMemberCatalogUserId,
} from "./lib/team-catalog-ui.js";
export {
  buildAssigneeProfileMap,
  getTeamMembersPluginState,
  type TeamMemberCatalogRow,
  type TeamMembersPluginApi,
} from "./plugins.js";
export {
  tasksListOptions,
  useTaskSettingsQuery,
  useTasksListQuery,
  useUpdateTasksListMutation,
} from "./tasks-queries.js";
