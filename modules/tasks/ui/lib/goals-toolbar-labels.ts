export function getGoalsToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number
) {
  return {
    searchPlaceholder: t("goals.searchPlaceholder"),
    display: t("goals.display"),
    paginationSummary: t("goals.paginationSummary", { total }),
    addGoal: t("goals.newGoal"),
    table: t("goals.viewTable"),
    cards: t("goals.viewCards"),
    compactView: t("goals.compactView"),
    sortBy: t("goals.sortBy"),
    ascending: t("goals.ascending"),
    descending: t("goals.descending"),
    displayedColumns: t("goals.displayedColumns"),
    hiddenInTable: t("goals.hiddenInTable"),
    showAll: t("goals.showAll"),
    hideAll: t("goals.hideAll"),
    noColumnsDisplayed: t("goals.noColumnsDisplayed"),
    sortByTitle: t("goals.sortByTitle"),
    sortByUpdatedAt: t("goals.sortByUpdatedAt"),
    sortByCreatedAt: t("goals.sortByCreatedAt"),
    sortByStatus: t("goals.sortByStatus"),
    title: t("form.title"),
    status: t("form.status"),
    tasks: t("goals.tasksColumn"),
    targetDate: t("goals.targetDate"),
    updatedAt: t("goals.detail.updated"),
    filterAllStatuses: t("goals.filterAllStatuses"),
  };
}

export type GoalsToolbarLabels = ReturnType<typeof getGoalsToolbarLabels>;
