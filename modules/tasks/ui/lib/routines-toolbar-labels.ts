export function getRoutinesToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number
) {
  return {
    searchPlaceholder: t("routines.list.searchPlaceholder"),
    display: t("routines.list.display"),
    paginationSummary: t("routines.list.paginationSummary", { total }),
    filterAll: t("routines.list.filterAll"),
    filterEnabled: t("routines.list.enabled"),
    filterDisabled: t("routines.list.disabled"),
    sortBy: t("routines.list.sortBy"),
    ascending: t("routines.list.ascending"),
    descending: t("routines.list.descending"),
    sortByName: t("routines.list.sortByName"),
    sortByLastRun: t("routines.list.sortByLastRun"),
    sortByEnabled: t("routines.list.sortByEnabled"),
    // Unused by sort-only display menu — required by ListDisplayConfigurator labels.
    table: "",
    cards: "",
    displayedColumns: "",
    hiddenInTable: "",
    showAll: "",
    hideAll: "",
    noColumnsDisplayed: "",
  };
}

export type RoutinesToolbarLabels = ReturnType<typeof getRoutinesToolbarLabels>;
