import {
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbarIconButton,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@engenty/ui-core";
import { SlidersHorizontal } from "lucide-react";
import type { getRoutinesToolbarLabels } from "../lib/routines-toolbar-labels.js";
import type {
  RoutinesEnabledFilter,
  RoutinesSortColumn,
} from "./routines-display-dialog.js";
import { RoutinesDisplayDialog } from "./routines-display-dialog.js";

interface RoutinesToolbarProps {
  enabledFilter: RoutinesEnabledFilter;
  labels: ReturnType<typeof getRoutinesToolbarLabels>;
  onEnabledFilterChange: (value: RoutinesEnabledFilter) => void;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  setSortBy: (column: RoutinesSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  sortBy: RoutinesSortColumn;
  sortOptions: { value: RoutinesSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
}

export function RoutinesToolbar({
  searchQuery,
  onSearchChange,
  enabledFilter,
  onEnabledFilterChange,
  labels,
  sortBy,
  setSortBy,
  sortOptions,
  sortOrder,
  setSortOrder,
}: RoutinesToolbarProps) {
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
          onEnabledFilterChange((value ?? "all") as RoutinesEnabledFilter)
        }
        value={enabledFilter}
      >
        <ListFilterSelectTrigger className="min-w-[9rem]">
          <SelectValue>
            {enabledFilter === "all"
              ? labels.filterAll
              : enabledFilter === "enabled"
                ? labels.filterEnabled
                : labels.filterDisabled}
          </SelectValue>
        </ListFilterSelectTrigger>
        <SelectContent>
          <SelectItem value="all">{labels.filterAll}</SelectItem>
          <SelectItem value="enabled">{labels.filterEnabled}</SelectItem>
          <SelectItem value="disabled">{labels.filterDisabled}</SelectItem>
        </SelectContent>
      </Select>

      <p className="mr-auto text-muted-foreground text-xs">
        {labels.paginationSummary}
      </p>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ListToolbarIconButton aria-label={labels.display} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        </DropdownMenuTrigger>
        <RoutinesDisplayDialog
          labels={labels}
          setSortBy={setSortBy}
          setSortOrder={setSortOrder}
          sortBy={sortBy}
          sortOptions={sortOptions}
          sortOrder={sortOrder}
        />
      </DropdownMenu>
    </div>
  );
}
