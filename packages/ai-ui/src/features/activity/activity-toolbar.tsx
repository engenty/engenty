// Full toolbar for the activity list: search (with expandable filter row),
// result count, feed/table switch and the display configurator
// (sort / group / columns / density). Mirrors the artifacts catalog toolbar.

import { useTranslation } from "@engenty/i18n/ui";
import {
  type ColumnConfig,
  cn,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListFilterChip,
  ListSearchInput,
  ListToolbarIconButton,
  ListViewModeToggle,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Bot,
  Boxes,
  CircleDot,
  Clock,
  Link2,
  ListFilter,
  SlidersHorizontal,
  Text,
  User,
} from "lucide-react";
import type { ActivityStatusFilter } from "./activity-entries";
import type { ActivityGroupBy, ActivitySortBy } from "./activity-list-state";

export type ActivityColumnKey =
  | "status"
  | "agent"
  | "title"
  | "user"
  | "binding"
  | "updated";
export type ActivityColumnVisibility = Record<ActivityColumnKey, boolean>;

export interface ActivityToolbarProps {
  agentFilter: string | null;
  agentOptions: { id: string; name: string }[];
  columnOrder: ActivityColumnKey[];
  columnVisibility: ActivityColumnVisibility;
  filteredCount: number;
  filtersExpanded: boolean;
  groupBy: ActivityGroupBy;
  hasActiveFilters: boolean;
  onAgentFilterChange: (value: string | null) => void;
  onFiltersToggle: () => void;
  onGroupByChange: (value: ActivityGroupBy) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ActivitySortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: ActivityStatusFilter) => void;
  searchQuery: string;
  setColumnOrder: (order: ActivityColumnKey[]) => void;
  setColumnVisibility: (value: ActivityColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ActivitySortBy;
  sortOrder: SortOrder;
  statusFilter: ActivityStatusFilter;
  tableSize: TableSize;
  totalCount: number;
  viewMode: ViewMode;
}

const ALL_AGENTS_VALUE = "__all__";

export function ActivityToolbar({
  agentFilter,
  agentOptions,
  columnOrder,
  columnVisibility,
  filteredCount,
  filtersExpanded,
  groupBy,
  hasActiveFilters,
  onAgentFilterChange,
  onFiltersToggle,
  onGroupByChange,
  onSearchChange,
  onSortByChange,
  onSortOrderChange,
  onStatusFilterChange,
  searchQuery,
  setColumnOrder,
  setColumnVisibility,
  setTableSize,
  setViewMode,
  sortBy,
  sortOrder,
  statusFilter,
  tableSize,
  totalCount,
  viewMode,
}: ActivityToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const columns: ColumnConfig<ActivityColumnKey>[] = [
    { key: "status", label: t("activity.column.status"), icon: CircleDot },
    { key: "agent", label: t("activity.column.agent"), icon: Bot },
    { key: "title", label: t("activity.column.title"), icon: Text },
    { key: "user", label: t("activity.column.user"), icon: User },
    { key: "binding", label: t("activity.column.binding"), icon: Link2 },
    { key: "updated", label: t("activity.column.updated"), icon: Clock },
  ];

  const sortOptions = [
    { label: t("activity.sort.timestamp"), value: "timestamp" as const },
    { label: t("activity.sort.title"), value: "title" as const },
    { label: t("activity.sort.agent"), value: "agent" as const },
  ];

  const groupByOptions = [
    { label: t("activity.groupBy.day"), value: "day" },
    { label: t("activity.groupBy.agent"), value: "agent" },
    { label: t("activity.groupBy.status"), value: "status" },
    { label: t("activity.groupBy.none"), value: "none" },
  ];

  const agentChipOptions = [
    { label: t("activity.filterAllAgents"), value: ALL_AGENTS_VALUE },
    ...agentOptions.map((agent) => ({ label: agent.name, value: agent.id })),
  ];

  const statusOptions = [
    { label: t("activity.status_all"), value: "all" },
    { label: t("activity.status_running"), value: "running" },
    { label: t("activity.status_failed"), value: "failed" },
    { label: t("activity.status_finished"), value: "finished" },
  ];

  const labelFor = (
    options: { label: string; value: string }[],
    value: string
  ) => options.find((option) => option.value === value)?.label;

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
            <ListSearchInput
              className="w-full pr-10"
              onChange={(event) => onSearchChange(event.target.value)}
              onOpenFilters={() => {
                if (!filtersExpanded) {
                  onFiltersToggle();
                }
              }}
              placeholder={t("activity.searchPlaceholder")}
              value={searchQuery}
              wrapperClassName="w-full"
            />
            <ListToolbarIconButton
              aria-label={t("activity.filterToggle")}
              aria-pressed={filtersExpanded}
              className={cn(
                "absolute top-1/2 right-1 -translate-y-1/2",
                (filtersExpanded || hasActiveFilters) && "text-foreground"
              )}
              onClick={onFiltersToggle}
              type="button"
            >
              <span className="relative inline-flex">
                <ListFilter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </span>
            </ListToolbarIconButton>
          </div>
          <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {t("activity.count", { count: filteredCount, total: totalCount })}
          </p>
        </div>

        <ListViewModeToggle
          labels={{
            cards: t("activity.feedView"),
            table: t("activity.tableView"),
          }}
          onChange={setViewMode}
          value={viewMode}
        />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <ListToolbarIconButton
              aria-label={t("activity.display")}
              type="button"
            >
              <SlidersHorizontal />
            </ListToolbarIconButton>
          </DropdownMenuTrigger>
          <ListDisplayConfigurator<ActivityColumnKey, ActivitySortBy>
            columnOrder={columnOrder}
            columns={columns}
            columnVisibility={columnVisibility}
            groupBy={groupBy}
            groupByOptions={groupByOptions}
            labels={{
              ascending: t("activity.sortAscending"),
              cards: t("activity.feedView"),
              compactView: t("activity.compactView"),
              descending: t("activity.sortDescending"),
              displayedInTable: t("activity.displayedColumns"),
              groupBy: t("activity.groupByLabel"),
              hiddenInTable: t("activity.hiddenColumns"),
              hideAll: t("activity.hideAll"),
              noColumnsDisplayed: t("activity.noColumns"),
              showAll: t("activity.showAll"),
              sortBy: t("activity.sortByLabel"),
              table: t("activity.tableView"),
            }}
            setColumnOrder={setColumnOrder}
            setColumnVisibility={setColumnVisibility}
            setGroupBy={(value) => onGroupByChange(value as ActivityGroupBy)}
            setSortBy={onSortByChange}
            setSortOrder={onSortOrderChange}
            setTableSize={setTableSize}
            setViewMode={setViewMode}
            sortBy={sortBy}
            sortOptions={sortOptions}
            sortOrder={sortOrder}
            tableSize={tableSize}
            viewMode={viewMode}
            viewModes={["table", "cards"]}
          />
        </DropdownMenu>
      </div>

      {filtersExpanded ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <ListFilterChip
            activeLabel={labelFor(groupByOptions, groupBy)}
            ariaLabel={t("activity.groupByLabel")}
            clearLabel={t("activity.groupBy.day")}
            isActive={groupBy !== "day"}
            label={t("activity.groupByLabel")}
            onClear={() => onGroupByChange("day")}
            onSelect={(value) => onGroupByChange(value as ActivityGroupBy)}
            options={groupByOptions}
            value={groupBy}
          />
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-border sm:block"
          />
          <ListFilterChip
            activeLabel={labelFor(
              agentChipOptions,
              agentFilter ?? ALL_AGENTS_VALUE
            )}
            ariaLabel={t("activity.filter.agent")}
            clearLabel={t("activity.filterAllAgents")}
            isActive={agentFilter !== null}
            label={t("activity.filter.agent")}
            onClear={() => onAgentFilterChange(null)}
            onSelect={(value) =>
              onAgentFilterChange(value === ALL_AGENTS_VALUE ? null : value)
            }
            options={agentChipOptions}
            value={agentFilter ?? ALL_AGENTS_VALUE}
          />
          <ListFilterChip
            activeLabel={labelFor(statusOptions, statusFilter)}
            ariaLabel={t("activity.filter.status")}
            clearLabel={t("activity.status_all")}
            isActive={statusFilter !== "all"}
            label={t("activity.filter.status")}
            onClear={() => onStatusFilterChange("all")}
            onSelect={(value) =>
              onStatusFilterChange(value as ActivityStatusFilter)
            }
            options={statusOptions}
            value={statusFilter}
          />
        </div>
      ) : null}
    </div>
  );
}
