export function getProjectsTasksToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number
): {
  scopeMine: string;
  scopeAll: string;
  searchPlaceholder: string;
  display: string;
  paginationSummary: string;
  addTask: string;
  table: string;
  cards: string;
  kanbanView: string;
  compactView: string;
  sortBy: string;
  ascending: string;
  descending: string;
  displayedColumns: string;
  hiddenInTable: string;
  showAll: string;
  hideAll: string;
  noColumnsDisplayed: string;
  sortByTitle: string;
  sortByUpdatedAt: string;
  sortByCreatedAt: string;
  sortByStatus: string;
  title: string;
  project: string;
  phase: string;
  assignees: string;
  status: string;
  hours: string;
  updatedAt: string;
  filterProject: string;
  filterStatus: string;
  filterAllStatuses: string;
  statusTodo: string;
  statusInProgress: string;
  statusDone: string;
  statusRequest: string;
} {
  return {
    scopeMine: t("tasks.scopeMine"),
    scopeAll: t("tasks.scopeAll"),
    searchPlaceholder: t("tasks.searchPlaceholder"),
    display: t("display"),
    paginationSummary: t("tasks.paginationSummary", { total }),
    addTask: t("tasks.addTask"),
    table: t("tableView"),
    cards: t("cardsView"),
    kanbanView: t("tasks.kanbanView"),
    compactView: t("compactView"),
    sortBy: t("sortBy"),
    ascending: t("ascending"),
    descending: t("descending"),
    displayedColumns: t("displayedColumns"),
    hiddenInTable: t("hiddenInTable"),
    showAll: t("showAll"),
    hideAll: t("hideAll"),
    noColumnsDisplayed: t("noColumnsDisplayed"),
    sortByTitle: t("tasks.sortByTitle"),
    sortByUpdatedAt: t("tasks.sortByUpdatedAt"),
    sortByCreatedAt: t("tasks.sortByCreatedAt"),
    sortByStatus: t("tasks.sortByStatus"),
    title: t("tasks.columns.title"),
    project: t("tasks.columns.project"),
    phase: t("tasks.columns.phase"),
    assignees: t("tasks.columns.assignees"),
    status: t("tasks.columns.status"),
    hours: t("tasks.columns.hours"),
    updatedAt: t("tasks.columns.updatedAt"),
    filterProject: t("tasks.columns.project"),
    filterStatus: t("tasks.columns.status"),
    filterAllStatuses: t("tasks.filterAllStatuses"),
    statusTodo: t("detail.status.todo"),
    statusInProgress: t("detail.status.in_progress"),
    statusDone: t("detail.status.done"),
    statusRequest: t("detail.status.request"),
  };
}

export type ProjectsTasksToolbarLabels = ReturnType<
  typeof getProjectsTasksToolbarLabels
>;
