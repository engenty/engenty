export function getFaqsToolbarLabels(
  t: (key: string, options?: Record<string, unknown>) => string,
  total: number
) {
  return {
    searchPlaceholder: t("faq.list.search"),
    display: t("display.display"),
    paginationSummary: t("faq.list.pagination_summary", { total }),
    sortByQuestion: t("faq.list.sort_by_question"),
    sortByStatus: t("list.sort_by_status"),
    sortByCreatedAt: t("list.sort_by_created_at"),
    sortByUpdatedAt: t("list.sort_by_updated_at"),
    sortBySortOrder: t("list.sort_by_sort_order"),
    ascending: t("display.ascending"),
    descending: t("display.descending"),
    compactView: t("display.compactView"),
    tableView: t("display.tableView"),
    cardsView: t("display.cardsView"),
    sortBy: t("display.sortBy"),
    displayedColumns: t("display.displayedColumns"),
    hiddenInTable: t("display.hiddenInTable"),
    showAll: t("display.showAll"),
    hideAll: t("display.hideAll"),
    noColumnsDisplayed: t("display.noColumnsDisplayed"),
    question: t("faq.fields.question"),
    status: t("columns.status"),
    tags: t("columns.tags"),
    createdAt: t("columns.created_at"),
    updatedAt: t("columns.updated_at"),
    sortOrder: t("columns.sort_order"),
  };
}
