export function getTasksToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number,
  selectedCount = 0
) {
  return {
    searchPlaceholder: t("list.searchPlaceholder"),
    display: t("list.display"),
    paginationSummary: t("list.paginationSummary", { total }),
    selectedSummary: t("list.selectedSummary", { count: selectedCount }),
    addTask: t("list.newTask"),
    table: t("list.viewTable"),
    cards: t("list.viewGrouped"),
    kanbanView: t("list.viewKanban"),
    filterByAssigneeKind: t("list.filterByAssigneeKind"),
    assigneeHuman: t("list.assigneeHuman"),
    assigneeAgent: t("list.assigneeAgent"),
    compactView: t("list.compactView"),
    sortBy: t("list.sortBy"),
    ascending: t("list.ascending"),
    descending: t("list.descending"),
    displayedColumns: t("list.displayedColumns"),
    hiddenInTable: t("list.hiddenInTable"),
    showAll: t("list.showAll"),
    hideAll: t("list.hideAll"),
    noColumnsDisplayed: t("list.noColumnsDisplayed"),
    sortByTitle: t("list.sortByTitle"),
    sortByUpdatedAt: t("list.sortByUpdatedAt"),
    sortByCreatedAt: t("list.sortByCreatedAt"),
    sortByStatus: t("list.sortByStatus"),
    sortByIdentifier: t("list.sortByIdentifier"),
    identifier: t("list.identifier"),
    title: t("list.titleColumn"),
    assignee: t("list.assignee"),
    status: t("list.status"),
    priority: t("list.priority"),
    dueDate: t("list.dueDate"),
    updatedAt: t("list.updated"),
    filterAllStatuses: t("list.filterAllStatuses"),
    groupedByLabel: t("list.groupedByLabel"),
  };
}

export type TasksToolbarLabels = ReturnType<typeof getTasksToolbarLabels>;
