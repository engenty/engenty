import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarIconButton,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarOverflowItem,
  ListToolbarSearch,
  ListToolbarSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  useListToolbar,
} from "@engenty/ui-core";
import { Bot, List, Rows2, SlidersHorizontal, User } from "lucide-react";
import type { GoalStatus } from "../../src/schema/types.js";
import type { getGoalsToolbarLabels } from "../lib/goals-toolbar-labels.js";
import { GOAL_STATUSES } from "./goal-status-badge.js";
import type {
  GoalColumnOption,
  GoalsColumnVisibility,
  GoalsSortColumn,
  GoalsViewMode,
  TableSize,
} from "./goals-display-dialog.js";
import { GoalsDisplayDialog } from "./goals-display-dialog.js";

export type GoalsOwnerKind = "user" | "agent" | "";

interface GoalsToolbarProps {
  columnOrder: (keyof GoalsColumnVisibility)[];
  columns: GoalColumnOption[];
  columnVisibility: GoalsColumnVisibility;
  labels: ReturnType<typeof getGoalsToolbarLabels>;
  onOwnerKindChange: (kind: GoalsOwnerKind) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (status: GoalStatus | "all") => void;
  ownerKind: GoalsOwnerKind;
  searchQuery: string;
  setColumnOrder: (order: (keyof GoalsColumnVisibility)[]) => void;
  setColumnVisibility: (value: GoalsColumnVisibility) => void;
  setSortBy: (column: GoalsSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  setTableSize?: (size: TableSize) => void;
  setViewMode: (mode: GoalsViewMode) => void;
  sortBy: GoalsSortColumn;
  sortOptions: { value: GoalsSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
  statusFilter: GoalStatus | "all";
  tableSize?: TableSize;
  viewMode: GoalsViewMode;
}

function GoalsDisplayMenu(props: {
  columnOrder: (keyof GoalsColumnVisibility)[];
  columns: GoalColumnOption[];
  columnVisibility: GoalsColumnVisibility;
  labels: ReturnType<typeof getGoalsToolbarLabels>;
  setColumnOrder: (order: (keyof GoalsColumnVisibility)[]) => void;
  setColumnVisibility: (value: GoalsColumnVisibility) => void;
  setSortBy: (column: GoalsSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  setTableSize?: (size: TableSize) => void;
  sortBy: GoalsSortColumn;
  sortOptions: { value: GoalsSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
  tableSize?: TableSize;
}) {
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={props.labels.display}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {props.labels.display}
          </Button>
        ) : (
          <ListToolbarIconButton
            aria-label={props.labels.display}
            type="button"
          >
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <GoalsDisplayDialog
        columnOrder={props.columnOrder}
        columns={props.columns}
        columnVisibility={props.columnVisibility}
        labels={props.labels}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
        setSortBy={props.setSortBy}
        setSortOrder={props.setSortOrder}
        setTableSize={props.setTableSize}
        sortBy={props.sortBy}
        sortOptions={props.sortOptions}
        sortOrder={props.sortOrder}
        tableSize={props.tableSize}
      />
    </DropdownMenu>
  );
}

export function GoalsToolbar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  labels,
  ownerKind,
  onOwnerKindChange,
  viewMode,
  setViewMode,
  tableSize,
  setTableSize,
  columnOrder,
  columnVisibility,
  setColumnOrder,
  setColumnVisibility,
  columns,
  sortBy,
  setSortBy,
  sortOptions,
  sortOrder,
  setSortOrder,
}: GoalsToolbarProps) {
  const { t } = useTranslation("tasks");

  return (
    <ListToolbar>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={labels.searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <Select
          onValueChange={(value) =>
            onStatusFilterChange(
              value === "all" ? "all" : (value as GoalStatus)
            )
          }
          value={statusFilter}
        >
          <ListFilterSelectTrigger className="min-w-[9rem]">
            <SelectValue placeholder={labels.filterAllStatuses}>
              {statusFilter === "all"
                ? labels.filterAllStatuses
                : t(`goals.status.${statusFilter}`)}
            </SelectValue>
          </ListFilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">{labels.filterAllStatuses}</SelectItem>
            {GOAL_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`goals.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ListIconSegmentToggle<GoalsOwnerKind>
          allowDeselect
          aria-label={labels.filterByOwnerKind}
          className="shrink-0"
          onChange={(next) => onOwnerKindChange(next)}
          segments={[
            { value: "user", label: labels.ownerHuman, icon: User },
            { value: "agent", label: labels.ownerAgent, icon: Bot },
          ]}
          value={ownerKind}
        />
        <ListToolbarSummary>{labels.paginationSummary}</ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListIconSegmentToggle<GoalsViewMode>
            onChange={(next) => {
              if (next !== "") {
                setViewMode(next);
              }
            }}
            segments={[
              { value: "cards", label: labels.cards, icon: Rows2 },
              { value: "table", label: labels.table, icon: List },
            ]}
            value={viewMode}
          />
          <ListToolbarOverflowItem>
            <GoalsDisplayMenu
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              labels={labels}
              setColumnOrder={setColumnOrder}
              setColumnVisibility={setColumnVisibility}
              setSortBy={setSortBy}
              setSortOrder={setSortOrder}
              setTableSize={setTableSize}
              sortBy={sortBy}
              sortOptions={sortOptions}
              sortOrder={sortOrder}
              tableSize={tableSize}
            />
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
      </ListToolbarActions>
    </ListToolbar>
  );
}
