export function getTeamMembersToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number,
  selectedCount = 0
): {
  searchPlaceholder: string;
  display: string;
  viewModeGroup: string;
  paginationSummary: string;
  selectedSummary: string;
  sortByName: string;
  sortByPosition: string;
  sortByDepartment: string;
  sortByCreatedAt: string;
  ascending: string;
  descending: string;
  compactView: string;
  tableView: string;
  cardsView: string;
  sortBy: string;
  groupBy: string;
  groupByNone: string;
  groupByDepartment: string;
  groupByRole: string;
  groupByLocation: string;
  displayedColumns: string;
  hiddenInTable: string;
  showAll: string;
  hideAll: string;
  noColumnsDisplayed: string;
  toolbarMore: string;
  avatar: string;
  fullName: string;
  position: string;
  department: string;
  location: string;
  phone: string;
  linkedUser: string;
  reportsTo: string;
  itemsPerPage: string;
} {
  return {
    searchPlaceholder: t("searchPlaceholder"),
    display: t("display"),
    viewModeGroup: t("viewModeGroup"),
    paginationSummary: t("paginationSummary", { total }),
    selectedSummary: t("selectedSummary", { count: selectedCount }),
    sortByName: t("sortByName"),
    sortByPosition: t("sortByPosition"),
    sortByDepartment: t("sortByDepartment"),
    sortByCreatedAt: t("sortByCreatedAt"),
    ascending: t("ascending"),
    descending: t("descending"),
    compactView: t("compactView"),
    tableView: t("tableView"),
    cardsView: t("cardsView"),
    sortBy: t("sortBy"),
    groupBy: t("displayGroupBy"),
    groupByNone: t("filters.groupByNone"),
    groupByDepartment: t("filters.groupByDepartment"),
    groupByRole: t("filters.groupByRole"),
    groupByLocation: t("filters.groupByLocation"),
    displayedColumns: t("displayedColumns"),
    hiddenInTable: t("hiddenInTable"),
    showAll: t("showAll"),
    hideAll: t("hideAll"),
    noColumnsDisplayed: t("noColumnsDisplayed"),
    toolbarMore: t("toolbarMore", { defaultValue: "More" }),
    avatar: t("avatar"),
    fullName: t("fullName"),
    position: t("position"),
    department: t("department"),
    location: t("location"),
    phone: t("phone"),
    linkedUser: t("linkedUser"),
    reportsTo: t("reportsTo"),
    itemsPerPage: t("itemsPerPage"),
  };
}
