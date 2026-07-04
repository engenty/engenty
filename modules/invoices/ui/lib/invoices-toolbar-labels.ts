export function getInvoicesToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number
): {
  searchPlaceholder: string;
  display: string;
  paginationSummary: string;
  sortByNumber: string;
  sortByDate: string;
  sortByDueDate: string;
  sortBySumBrutto: string;
  sortByCreatedAt: string;
  ascending: string;
  descending: string;
  compactView: string;
  tableView: string;
  cardsView: string;
  sortBy: string;
  displayedColumns: string;
  hiddenInTable: string;
  showAll: string;
  hideAll: string;
  noColumnsDisplayed: string;
  number: string;
  date: string;
  dueDate: string;
  recipient: string;
  sumBrutto: string;
  content: string;
} {
  return {
    searchPlaceholder: t("searchPlaceholder", {
      defaultValue: "Search invoices...",
    }),
    display: t("display", { defaultValue: "Display" }),
    paginationSummary: t("paginationSummary", {
      total,
      defaultValue: "{{total}} invoices",
    }),
    sortByNumber: t("number"),
    sortByDate: t("date"),
    sortByDueDate: t("dueDate"),
    sortBySumBrutto: t("brutto"),
    sortByCreatedAt: t("sortByCreatedAt", { defaultValue: "Created" }),
    ascending: t("ascending", { defaultValue: "Asc" }),
    descending: t("descending", { defaultValue: "Desc" }),
    compactView: t("compactView", { defaultValue: "Compact" }),
    tableView: t("tableView", { defaultValue: "Table" }),
    cardsView: t("cardsView", { defaultValue: "Cards" }),
    sortBy: t("sortBy", { defaultValue: "Sort by" }),
    displayedColumns: t("displayedColumns", {
      defaultValue: "Displayed columns",
    }),
    hiddenInTable: t("hiddenInTable", { defaultValue: "Hidden" }),
    showAll: t("showAll", { defaultValue: "Show all" }),
    hideAll: t("hideAll", { defaultValue: "Hide all" }),
    noColumnsDisplayed: t("noColumnsDisplayed", { defaultValue: "No columns" }),
    number: t("number"),
    date: t("date"),
    dueDate: t("dueDate"),
    recipient: t("recipient"),
    sumBrutto: t("brutto"),
    content: t("content"),
  };
}
