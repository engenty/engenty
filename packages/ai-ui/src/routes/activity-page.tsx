// /admin/engenty/activity — audit list of sessions with search, filters,
// grouping, sort, and feed/table views (ui-6 §5). Filters live in the URL
// (deep-linkable); display preferences persist via useListDisplayState.

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
import { ArrowRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  ActivityFilterState,
  ActivityStatusFilter,
} from "../features/activity/activity-entries.js";
import {
  hasRunningActivityEntry,
  toActivityEntries,
} from "../features/activity/activity-entries.js";
import { ActivityListFeed } from "../features/activity/activity-list-feed.js";
import {
  type ActivityGroupBy,
  type ActivitySortBy,
  filterAndSortActivityEntries,
  groupActivityList,
} from "../features/activity/activity-list-state.js";
import { ActivityTable } from "../features/activity/activity-table.js";
import {
  type ActivityColumnKey,
  type ActivityColumnVisibility,
  ActivityToolbar,
} from "../features/activity/activity-toolbar.js";
import { AGENTS_WORKSPACE_ROOT_PATH } from "../features/agents-workspace/agent-workspace-paths.js";
import { EngentyCanvasPageChrome } from "../features/agents-workspace/engenty-catalog-page-chrome.js";
import { useAgentsWorkspaceShellNav } from "../features/agents-workspace/use-agents-workspace-shell-nav.js";
import { useWorkspaceNavData } from "../features/agents-workspace/use-workspace-nav-data.js";
import { useAdminAiThreadsQuery } from "../lib/admin/ai-runtime-queries.js";

const OPERATIONS_COCKPIT_PATH = "/mdl/tasks/operations";
const STATUS_VALUES = new Set(["all", "running", "failed", "finished"]);

const ACTIVITY_COLUMNS: ActivityColumnKey[] = [
  "status",
  "agent",
  "title",
  "user",
  "binding",
  "updated",
];

const DISPLAY_DEFAULTS = {
  columnOrder: ACTIVITY_COLUMNS,
  columnVisibility: {
    agent: true,
    binding: false,
    status: true,
    title: true,
    updated: true,
    user: true,
  } satisfies ActivityColumnVisibility,
  sortBy: "timestamp" as ActivitySortBy,
  sortOrder: "desc" as const,
  tableSize: "compact" as const,
  viewMode: "cards" as const,
};

function readFilters(searchParams: URLSearchParams): ActivityFilterState {
  const status = searchParams.get("status") ?? "all";
  return {
    agentId: searchParams.get("agent"),
    search: searchParams.get("q") ?? "",
    status: (STATUS_VALUES.has(status)
      ? status
      : "all") as ActivityStatusFilter,
  };
}

export function ActivityPage() {
  const { t } = useTranslation("ai-ui");
  const nav = useWorkspaceNavData();
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);
  const [groupBy, setGroupBy] = useState<ActivityGroupBy>("day");
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

  const display = useListDisplayState<ActivityColumnKey, ActivitySortBy>({
    defaults: DISPLAY_DEFAULTS,
    storageKey: "ai-activity-list",
    validSortColumns: ["timestamp", "title", "agent"],
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

  // Live-poll only while a running entry is visible (same rule as the feed hook).
  const [livePoll, setLivePoll] = useState(false);
  const sessionsQuery = useAdminAiThreadsQuery(
    filters.agentId ? { agentId: filters.agentId } : null,
    livePoll
  );
  const allEntries = useMemo(
    () => toActivityEntries({ sessions: sessionsQuery.data?.sessions ?? [] }),
    [sessionsQuery.data?.sessions]
  );
  const shouldPoll = hasRunningActivityEntry(allEntries);
  useEffect(() => {
    setLivePoll(shouldPoll);
  }, [shouldPoll]);

  const agents = useMemo(
    () =>
      nav.agents
        .map((agent) => ({ id: agent.id, name: agent.name }))
        .toSorted((left, right) => left.name.localeCompare(right.name)),
    [nav.agents]
  );
  const agentNameById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent.name])),
    [agents]
  );

  const filtered = useMemo(
    () =>
      filterAndSortActivityEntries(
        allEntries,
        { ...filters, sortBy, sortOrder },
        agentNameById
      ),
    [allEntries, filters, sortBy, sortOrder, agentNameById]
  );
  const groups = useMemo(
    () => groupActivityList(filtered, groupBy, agentNameById),
    [filtered, groupBy, agentNameById]
  );

  const applyFilters = useCallback(
    (next: ActivityFilterState) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          const entries: [string, string | null][] = [
            ["agent", next.agentId],
            ["q", next.search.trim() ? next.search : null],
            ["status", next.status === "all" ? null : next.status],
          ];
          for (const [key, value] of entries) {
            if (value) {
              params.set(key, value);
            } else {
              params.delete(key);
            }
          }
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const hasActiveFilters = filters.agentId !== null || filters.status !== "all";

  const handleSortChange = useCallback(
    (column: ActivitySortBy) => {
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
      { label: t("activity.title") },
    ],
    contentStackBackground: "paper",
    secondaryNavAfterItems: shellNav.secondaryNavAfterItems,
    secondaryNavHeaderSlot: shellNav.secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
    topbarOverlap: true,
  });

  const isEmpty = !sessionsQuery.isLoading && allEntries.length === 0;
  const noResults =
    !sessionsQuery.isLoading && allEntries.length > 0 && filtered.length === 0;

  return (
    <EngentyCanvasPageChrome
      description={t("activity.description")}
      title={t("activity.title")}
    >
      <Link
        className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm transition hover:bg-muted/70 hover:text-foreground"
        to={OPERATIONS_COCKPIT_PATH}
      >
        <span>{t("activity.cockpitBanner")}</span>
        <span className="ml-auto inline-flex items-center gap-1 font-medium">
          {t("activity.cockpitBannerLink")}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </Link>

      <ActivityToolbar
        agentFilter={filters.agentId}
        agentOptions={agents}
        columnOrder={columnOrder}
        columnVisibility={columnVisibility}
        filteredCount={filtered.length}
        filtersExpanded={filtersExpanded}
        groupBy={groupBy}
        hasActiveFilters={hasActiveFilters}
        onAgentFilterChange={(agentId) => applyFilters({ ...filters, agentId })}
        onFiltersToggle={() => setFiltersExpanded((open) => !open)}
        onGroupByChange={setGroupBy}
        onSearchChange={(search) => applyFilters({ ...filters, search })}
        onSortByChange={setSortBy}
        onSortOrderChange={setSortOrder}
        onStatusFilterChange={(status) => applyFilters({ ...filters, status })}
        searchQuery={filters.search}
        setColumnOrder={setColumnOrder}
        setColumnVisibility={setColumnVisibility}
        setTableSize={setTableSize}
        setViewMode={setViewMode}
        sortBy={sortBy}
        sortOrder={sortOrder}
        statusFilter={filters.status}
        tableSize={tableSize}
        totalCount={allEntries.length}
        viewMode={viewMode}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {sessionsQuery.isLoading ? (
          <div className="grid gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-12 rounded-lg" key={index} />
            ))}
          </div>
        ) : null}

        {sessionsQuery.isError ? (
          <p className="text-destructive text-sm">{t("activity.error")}</p>
        ) : null}

        {isEmpty && !sessionsQuery.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("activity.empty")}</EmptyTitle>
              <EmptyDescription>{t("activity.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {noResults ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("activity.noResults")}</EmptyTitle>
              <EmptyDescription>{t("activity.description")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {filtered.length > 0 && viewMode === "cards" ? (
          <AdminListCardsView bottomFade>
            <ActivityListFeed
              agentNameById={agentNameById}
              groupBy={groupBy}
              groups={groups}
              isGroupOpen={isGroupOpen}
              onToggleGroup={toggleGroup}
            />
          </AdminListCardsView>
        ) : null}

        {filtered.length > 0 && viewMode === "table" ? (
          <AdminListTableView
            bottomFade
            scrollClassName={groupBy === "none" ? undefined : "rounded-lg"}
            stickyHeaderShadow
            transparent
          >
            <ActivityTable
              agentNameById={agentNameById}
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
    </EngentyCanvasPageChrome>
  );
}
