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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@engenty/ui-core";
import { Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { UserTableColumnConfig } from "./columns.js";
import type { UserColumnVisibility } from "./types.js";
import { UsersDisplayDialog } from "./users-display-dialog.js";

interface UsersTableToolbarProps {
  columnOrder: string[];
  columns: UserTableColumnConfig[];
  columnVisibility: UserColumnVisibility;
  hasActiveFilters: boolean;
  isAdmin: boolean;
  onClearFilters: () => void;
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
  isAdmin,
  totalCount,
}: UsersTableToolbarProps) {
  const activeFilterCount = [
    roleFilter !== "all",
    searchQuery.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8 text-xs"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name or email..."
            value={searchQuery}
          />
        </div>

        {selectedCount === 0 && (
          <div className="ml-2 whitespace-nowrap text-muted-foreground text-xs">
            {totalCount} {totalCount === 1 ? "user" : "users"}
          </div>
        )}

        <Select
          onValueChange={(value) =>
            setRoleFilter(value as "all" | "admin" | "member")
          }
          value={roleFilter}
        >
          <SelectTrigger className="h-9 w-[140px] text-xs">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            className="h-9 gap-1.5 px-2 text-xs"
            onClick={onClearFilters}
            size="sm"
            variant="ghost"
          >
            <X className="h-3.5 w-3.5" />
            Clear
            {activeFilterCount > 0 && (
              <Badge className="ml-0.5 px-1 text-xxs" variant="secondary">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}

        {selectedCount > 0 && isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="h-9 gap-1.5 px-2.5 text-xs"
                size="sm"
                variant="destructive"
              >
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
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="ml-auto h-9 gap-1.5 px-2.5 text-xs"
              size="sm"
              variant="outline"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Display
            </Button>
          </DropdownMenuTrigger>
          <UsersDisplayDialog
            columnOrder={columnOrder}
            columns={columns}
            columnVisibility={columnVisibility}
            setColumnOrder={setColumnOrder}
            setColumnVisibility={setColumnVisibility}
            setTableSize={setTableSize}
            tableSize={tableSize}
          />
        </DropdownMenu>
      </div>
    </div>
  );
}
