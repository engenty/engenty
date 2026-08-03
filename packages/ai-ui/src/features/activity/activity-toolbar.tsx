// Full toolbar for the activity list: search (with expandable filter row),
// result count, feed/table switch and the display configurator
// (sort / group / columns / density). Mirrors the artifacts catalog toolbar.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListFilterChip,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarFilterRow,
  ListToolbarFilterToggle,
  ListToolbarIconButton,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  ListViewModeToggle,
  type SortOrder,
  type TableSize,
  useListToolbar,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Bot,
  Boxes,
  CircleDot,
  Clock,
  Link2,
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

function ActivityDisplayMenu(props: {
  columnOrder: ActivityColumnKey[];
  columns: ColumnConfig<ActivityColumnKey>[];
  columnVisibility: ActivityColumnVisibility;
  displayLabel: string;
  groupBy: ActivityGroupBy;
  groupByOptions: { label: string; value: string }[];
  labels: {
    ascending: string;
    cards: string;
    compactView: string;
    descending: string;
    displayedInTable: string;
    groupBy: string;
    hiddenInTable: string;
    hideAll: string;
    noColumnsDisplayed: string;
    showAll: string;
    sortBy: string;
    table: string;
  };
  onGroupByChange: (value: ActivityGroupBy) => void;
  onSortByChange: (value: ActivitySortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
  setColumnOrder: (order: ActivityColumnKey[]) => void;
  setColumnVisibility: (value: ActivityColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ActivitySortBy;
  sortOptions: { label: string; value: ActivitySortBy }[];
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={props.displayLabel}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {props.displayLabel}
          </Button>
        ) : (
          <ListToolbarIconButton aria-label={props.displayLabel} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<ActivityColumnKey, ActivitySortBy>
        columnOrder={props.columnOrder}
        columns={props.columns}
        columnVisibility={props.columnVisibility}
        groupBy={props.groupBy}
        groupByOptions={props.groupByOptions}
        labels={props.labels}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
        setGroupBy={(value) => props.onGroupByChange(value as ActivityGroupBy)}
        setSortBy={props.onSortByChange}
        setSortOrder={props.onSortOrderChange}
        setTableSize={props.setTableSize}
        setViewMode={props.setViewMode}
        sortBy={props.sortBy}
        sortOptions={props.sortOptions}
        sortOrder={props.sortOrder}
        tableSize={props.tableSize}
        viewMode={props.viewMode}
        viewModes={["table", "cards"]}
      />
    </DropdownMenu>
  );
}

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
    <ListToolbar className="shrink-0">
      <ListToolbarMainArea>
        <ListToolbarSearch>
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
          <ListToolbarFilterToggle
            active={filtersExpanded || hasActiveFilters}
            aria-label={t("activity.filterToggle")}
            aria-pressed={filtersExpanded}
            onClick={onFiltersToggle}
            showDot={hasActiveFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {t("activity.count", { count: filteredCount, total: totalCount })}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("activity.feedView"),
              table: t("activity.tableView"),
            }}
            onChange={setViewMode}
            value={viewMode}
          />
          <ListToolbarOverflowItem>
            <ActivityDisplayMenu
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              displayLabel={t("activity.display")}
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
              onGroupByChange={onGroupByChange}
              onSortByChange={onSortByChange}
              onSortOrderChange={onSortOrderChange}
              setColumnOrder={setColumnOrder}
              setColumnVisibility={setColumnVisibility}
              setTableSize={setTableSize}
              setViewMode={setViewMode}
              sortBy={sortBy}
              sortOptions={sortOptions}
              sortOrder={sortOrder}
              tableSize={tableSize}
              viewMode={viewMode}
            />
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
      </ListToolbarActions>

      {filtersExpanded ? (
        <ListToolbarFilterRow>
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
        </ListToolbarFilterRow>
      ) : null}
    </ListToolbar>
  );
}
