import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
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

function RoutinesDisplayMenu(props: {
  labels: ReturnType<typeof getRoutinesToolbarLabels>;
  setSortBy: (column: RoutinesSortColumn) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  sortBy: RoutinesSortColumn;
  sortOptions: { value: RoutinesSortColumn; label: string }[];
  sortOrder: "asc" | "desc";
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
      <RoutinesDisplayDialog
        labels={props.labels}
        setSortBy={props.setSortBy}
        setSortOrder={props.setSortOrder}
        sortBy={props.sortBy}
        sortOptions={props.sortOptions}
        sortOrder={props.sortOrder}
      />
    </DropdownMenu>
  );
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
        <ListToolbarSummary>{labels.paginationSummary}</ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListToolbarOverflowItem>
            <RoutinesDisplayMenu
              labels={labels}
              setSortBy={setSortBy}
              setSortOrder={setSortOrder}
              sortBy={sortBy}
              sortOptions={sortOptions}
              sortOrder={sortOrder}
            />
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
      </ListToolbarActions>
    </ListToolbar>
  );
}
