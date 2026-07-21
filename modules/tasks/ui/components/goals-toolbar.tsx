import { useTranslation } from "@engenty/i18n/ui";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbarIconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
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
    <div className="flex flex-wrap items-center gap-2">
      <ListSearchInput
        className="max-w-[220px]"
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={labels.searchPlaceholder}
        value={searchQuery}
      />

      <Select
        onValueChange={(value) =>
          onStatusFilterChange(value === "all" ? "all" : (value as GoalStatus))
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

      <p className="text-muted-foreground text-xs">
        {labels.paginationSummary}
      </p>

      <ListIconSegmentToggle<GoalsOwnerKind>
        allowDeselect
        aria-label={labels.filterByOwnerKind}
        className="ml-auto shrink-0"
        onChange={(next) => onOwnerKindChange(next)}
        segments={[
          { value: "user", label: labels.ownerHuman, icon: User },
          { value: "agent", label: labels.ownerAgent, icon: Bot },
        ]}
        value={ownerKind}
      />

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ListToolbarIconButton aria-label={labels.display} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        </DropdownMenuTrigger>
        <GoalsDisplayDialog
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
      </DropdownMenu>
    </div>
  );
}
