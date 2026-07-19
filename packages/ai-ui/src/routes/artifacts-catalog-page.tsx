// Artifacts catalog — tenant-wide list of AI-created artifacts with search,
// filters, grouping, sort, and card/table views (GET /ai/artifacts/all).
// Grouped by scope (who can see it) by default. Read-only overview.

import { useTranslation } from "@engenty/i18n/ui";
import {
  AdminListCardsView,
  AdminListTableView,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  useListDisplayState,
} from "@engenty/ui-core";
import { usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useMemo, useState } from "react";
import { useAllArtifactsQuery } from "../artifacts/artifacts-api";
import { AGENTS_WORKSPACE_ROOT_PATH } from "../features/agents-workspace/agent-workspace-paths";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data";
import { ArtifactsCatalogCards } from "../features/artifacts-catalog/artifacts-catalog-cards";
import {
  type ArtifactCreatorFilter,
  type ArtifactGroupBy,
  type ArtifactScopeFilter,
  type ArtifactSortBy,
  type ArtifactStatusFilter,
  type ArtifactStorageFilter,
  filterAndSortArtifacts,
  getArtifactTypeValues,
  groupArtifacts,
} from "../features/artifacts-catalog/artifacts-catalog-state";
import { ArtifactsCatalogTable } from "../features/artifacts-catalog/artifacts-catalog-table";
import {
  type ArtifactColumnKey,
  type ArtifactColumnVisibility,
  ArtifactsCatalogToolbar,
} from "../features/artifacts-catalog/artifacts-catalog-toolbar";

const ARTIFACT_COLUMNS: ArtifactColumnKey[] = [
  "title",
  "scope",
  "storage",
  "type",
  "version",
  "updated",
  "status",
  "creator",
];

const DISPLAY_DEFAULTS = {
  columnOrder: ARTIFACT_COLUMNS,
  columnVisibility: {
    creator: false,
    scope: true,
    status: true,
    storage: true,
    title: true,
    type: true,
    updated: true,
    version: false,
  } satisfies ArtifactColumnVisibility,
  sortBy: "updated_at" as ArtifactSortBy,
  sortOrder: "desc" as const,
  tableSize: "compact" as const,
  viewMode: "cards" as const,
};

export function ArtifactsCatalogPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();

  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<ArtifactGroupBy>("scope");
  const [scopeFilter, setScopeFilter] = useState<ArtifactScopeFilter>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [storageFilter, setStorageFilter] =
    useState<ArtifactStorageFilter>("all");
  const [statusFilter, setStatusFilter] =
    useState<ArtifactStatusFilter>("active");
  const [creatorFilter, setCreatorFilter] =
    useState<ArtifactCreatorFilter>("all");
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const isGroupOpen = useCallback(
    (id: string) => !collapsedGroups[id],
    [collapsedGroups]
  );
  const toggleGroup = useCallback(
    (id: string) =>
      setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] })),
    []
  );

  const display = useListDisplayState<ArtifactColumnKey, ArtifactSortBy>({
    defaults: DISPLAY_DEFAULTS,
    storageKey: "ai-artifacts-catalog",
    validSortColumns: ["title", "updated_at", "type"],
    validViewModes: ["table", "cards"],
  });
  const {
    columnOrder,
    columnVisibility,
    setColumnOrder,
    setColumnVisibility,
    setSortBy,
    setSortOrder,
    setTableSize,
    setViewMode,
    sortBy,
    sortOrder,
    tableSize,
    viewMode,
  } = display;

  // Only fetch archived rows when a status filter actually needs them.
  const includeArchived = statusFilter !== "active";
  const artifactsQuery = useAllArtifactsQuery(includeArchived);
  const rows = useMemo(() => artifactsQuery.data ?? [], [artifactsQuery.data]);

  const typeOptions = useMemo(() => getArtifactTypeValues(rows), [rows]);

  const filtered = useMemo(
    () =>
      filterAndSortArtifacts(rows, {
        creator: creatorFilter,
        scope: scopeFilter,
        searchQuery,
        sortBy,
        sortOrder,
        status: statusFilter,
        storage: storageFilter,
        typeFilter,
      }),
    [
      rows,
      creatorFilter,
      scopeFilter,
      searchQuery,
      sortBy,
      sortOrder,
      statusFilter,
      storageFilter,
      typeFilter,
    ]
  );
  const groups = useMemo(
    () => groupArtifacts(filtered, groupBy),
    [filtered, groupBy]
  );

  const hasActiveFilters =
    scopeFilter !== "all" ||
    typeFilter !== "all" ||
    storageFilter !== "all" ||
    statusFilter !== "active" ||
    creatorFilter !== "all";

  const handleSortChange = useCallback(
    (column: ArtifactSortBy) => {
      if (sortBy === column) {
        setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      } else {
        setSortBy(column);
      }
    },
    [setSortBy, setSortOrder, sortBy, sortOrder]
  );

  const shellNav = useAgentsWorkspaceShellNav({ ...nav, selectedAgentId: "" });

  usePageConfig({
    breadcrumbs: [
      { label: t("menu.engenty"), to: AGENTS_WORKSPACE_ROOT_PATH },
      { label: t("artifactsCatalog.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  const isEmpty = !artifactsQuery.isLoading && rows.length === 0;
  const noResults =
    !artifactsQuery.isLoading && rows.length > 0 && groups.length === 0;

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-page">
      <ArtifactsCatalogToolbar
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        creatorFilter={creatorFilter}
        filteredCount={filtered.length}
        filtersExpanded={filtersExpanded}
        groupBy={groupBy}
        hasActiveFilters={hasActiveFilters}
        onCreatorFilterChange={setCreatorFilter}
        onFiltersToggle={() => setFiltersExpanded((open) => !open)}
        onGroupByChange={setGroupBy}
        onScopeFilterChange={setScopeFilter}
        onSearchChange={setSearchQuery}
        onSortByChange={setSortBy}
        onSortOrderChange={setSortOrder}
        onStatusFilterChange={setStatusFilter}
        onStorageFilterChange={setStorageFilter}
        onTypeFilterChange={setTypeFilter}
        scopeFilter={scopeFilter}
        searchQuery={searchQuery}
        setColumnOrder={setColumnOrder}
        setColumnVisibility={setColumnVisibility}
        setTableSize={setTableSize}
        setViewMode={setViewMode}
        sortBy={sortBy}
        sortOrder={sortOrder}
        statusFilter={statusFilter}
        storageFilter={storageFilter}
        tableSize={tableSize}
        totalCount={rows.length}
        typeFilter={typeFilter}
        typeOptions={typeOptions}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {artifactsQuery.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-24 rounded-lg" key={index} />
            ))}
          </div>
        ) : null}

        {isEmpty ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("artifactsCatalog.empty")}</EmptyTitle>
              <EmptyDescription>
                {t("artifactsCatalog.emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {noResults ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("artifactsCatalog.noResults")}</EmptyTitle>
              <EmptyDescription>{t("artifactsCatalog.lede")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {groups.length > 0 && viewMode === "cards" ? (
          <AdminListCardsView bottomFade>
            <ArtifactsCatalogCards
              groupBy={groupBy}
              groups={groups}
              isGroupOpen={isGroupOpen}
              onToggleGroup={toggleGroup}
              tableSize={tableSize}
            />
          </AdminListCardsView>
        ) : null}

        {groups.length > 0 && viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName={groupBy === "none" ? undefined : "rounded-lg"}
            stickyHeaderShadow
            transparent
          >
            <ArtifactsCatalogTable
              columnOrder={columnOrder}
              columnVisibility={columnVisibility}
              groupBy={groupBy}
              groups={groups}
              isGroupOpen={isGroupOpen}
              onSortChange={handleSortChange}
              onToggleGroup={toggleGroup}
              sortBy={sortBy}
              sortOrder={sortOrder}
            />
          </AdminListTableView>
        ) : null}
      </div>
    </section>
  );
}
