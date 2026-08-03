import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  ListFilterSelectTrigger,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarBulkActions,
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
import { SlidersHorizontal, Trash2, X } from "lucide-react";
import type { UserTableColumnConfig } from "./columns.js";
import type { UserColumnVisibility } from "./types.js";
import { UsersDisplayDialog } from "./users-display-dialog.js";

interface UsersTableToolbarProps {
  clearSelectionLabel?: string;
  columnOrder: string[];
  columns: UserTableColumnConfig[];
  columnVisibility: UserColumnVisibility;
  hasActiveFilters: boolean;
  isAdmin: boolean;
  onClearFilters: () => void;
  onClearSelection?: () => void;
  onDeleteSelected: () => void;
  roleFilter: string;
  searchQuery: string;
  selectedCount: number;
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (value: UserColumnVisibility) => void;
  setRoleFilter: (value: "all" | "admin" | "member") => void;
  setSearchQuery: (value: string) => void;
  setTableSize: (size: "compact" | "normal") => void;
  tableSize: "compact" | "normal";
  totalCount: number;
}

function UsersDisplayMenu(props: {
  columnOrder: string[];
  columns: UserTableColumnConfig[];
  columnVisibility: UserColumnVisibility;
  setColumnOrder: (order: string[]) => void;
  setColumnVisibility: (value: UserColumnVisibility) => void;
  setTableSize: (size: "compact" | "normal") => void;
  tableSize: "compact" | "normal";
}) {
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label="Display"
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Display
          </Button>
        ) : (
          <ListToolbarIconButton aria-label="Display" type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <UsersDisplayDialog
        columnOrder={props.columnOrder}
        columns={props.columns}
        columnVisibility={props.columnVisibility}
        setColumnOrder={props.setColumnOrder}
        setColumnVisibility={props.setColumnVisibility}
        setTableSize={props.setTableSize}
        tableSize={props.tableSize}
      />
    </DropdownMenu>
  );
}

export function UsersTableToolbar({
  columns,
  searchQuery,
  setSearchQuery,
  roleFilter,
  setRoleFilter,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  tableSize,
  setTableSize,
  hasActiveFilters,
  onClearFilters,
  selectedCount,
  onDeleteSelected,
  onClearSelection,
  clearSelectionLabel = "Clear",
  isAdmin,
  totalCount,
}: UsersTableToolbarProps) {
  const activeFilterCount = [
    roleFilter !== "all",
    searchQuery.length > 0,
  ].filter(Boolean).length;

  return (
    <ListToolbar className="mb-2" selectedCount={selectedCount}>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name or email..."
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <Select
          onValueChange={(value) =>
            setRoleFilter(value as "all" | "admin" | "member")
          }
          value={roleFilter}
        >
          <ListFilterSelectTrigger
            aria-label="Role filter"
            className="w-[140px]"
          >
            <SelectValue placeholder="All roles" />
          </ListFilterSelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button
            className="gap-1.5"
            onClick={onClearFilters}
            size="sm"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
            Clear
            {activeFilterCount > 0 ? (
              <Badge className="ml-0.5 px-1 text-xxs" variant="secondary">
                {activeFilterCount}
              </Badge>
            ) : null}
          </Button>
        ) : null}
        <ListToolbarSummary>
          {totalCount} {totalCount === 1 ? "user" : "users"}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions moreLabel="More">
        <ListToolbarIdleControls>
          <ListToolbarOverflowItem>
            <UsersDisplayMenu
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnOrder={setColumnOrder}
              setColumnVisibility={setColumnVisibility}
              setTableSize={setTableSize}
              tableSize={tableSize}
            />
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
        <ListToolbarBulkActions
          clearSelectionLabel={clearSelectionLabel}
          onClearSelection={onClearSelection}
        >
          {isAdmin ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="gap-1.5" size="sm" variant="destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({selectedCount})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Remove {selectedCount} user{selectedCount === 1 ? "" : "s"}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action permanently removes the selected users.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeleteSelected}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </ListToolbarBulkActions>
      </ListToolbarActions>
    </ListToolbar>
  );
}
