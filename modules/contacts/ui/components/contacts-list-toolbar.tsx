import type {
  ListPageSize,
  SortOrder,
  TableSize,
  ViewMode,
} from "@engenty/ui-core";
import { Button } from "@engenty/ui-core";
import { Pencil, Trash2 } from "lucide-react";
import type { ContactType } from "../../src/schema/index.js";
import type { ContactsListToolbarLabels } from "../pages/contacts-list-toolbar-labels.js";
import {
  type ContactsColumnVisibility,
  type ContactsSortColumn,
  ContactsTableToolbar,
} from "./contacts-display-dialog.js";

export interface ContactsListToolbarProps {
  allowedContactTypes?: ContactType[];
  bulkDeleting?: boolean;
  display: {
    columnOrder: (keyof ContactsColumnVisibility)[];
    columnVisibility: ContactsColumnVisibility;
    pageSize: ListPageSize;
    sortBy: ContactsSortColumn;
    sortOrder: SortOrder;
    viewMode: ViewMode;
    tableSize: TableSize;
    setSortBy: (v: ContactsSortColumn) => void;
    setSortOrder: (v: SortOrder) => void;
    setViewMode: (v: ViewMode) => void;
    setTableSize: (v: TableSize) => void;
    setColumnOrder: (v: (keyof ContactsColumnVisibility)[]) => void;
    setColumnVisibility: (v: ContactsColumnVisibility) => void;
    setPageSize: (v: ListPageSize) => void;
  };
  labels: ContactsListToolbarLabels;
  onDelete: () => void;
  onEditRoles: () => void;
  onPageSizeChange: (value: ListPageSize) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ContactsSortColumn) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onTypeChange?: (type: ContactType | "") => void;
  search: string;
  selection: {
    selectedIds: Set<string>;
    clearSelection: () => void;
  };
  total: number;
  typeFilter?: ContactType | "";
}

export function ContactsListToolbar({
  display,
  selection,
  typeFilter = "",
  allowedContactTypes,
  search,
  total,
  labels,
  onSearchChange,
  onTypeChange,
  onSortByChange,
  onSortOrderChange,
  onPageSizeChange,
  onEditRoles,
  onDelete,
  bulkDeleting = false,
}: ContactsListToolbarProps) {
  const bulkActions =
    selection.selectedIds.size > 0 ? (
      <div className="flex items-center gap-2">
        <Button
          className="gap-1.5"
          disabled={bulkDeleting}
          onClick={onEditRoles}
          size="sm"
          variant="outline"
        >
          <Pencil className="h-3.5 w-3.5" />
          {labels.editRoles}
        </Button>
        <Button
          className="gap-1.5"
          disabled={bulkDeleting}
          onClick={onDelete}
          size="sm"
          variant="destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {labels.delete}
        </Button>
      </div>
    ) : null;

  return (
    <ContactsTableToolbar
      allowedContactTypes={allowedContactTypes}
      bulkActions={bulkActions}
      clearSelectionLabel={labels.clearSelection}
      columnOrder={display.columnOrder}
      columnVisibility={display.columnVisibility}
      labels={{
        filterByType: labels.filterByType,
        selectedSummary: labels.selectedSummary,
        searchPlaceholder: labels.searchPlaceholder,
        display: labels.display,
        viewModeGroup: labels.viewModeGroup,
        paginationSummary: labels.paginationSummary,
        sortByName: labels.sortByName,
        sortByCreatedAt: labels.sortByCreatedAt,
        ascending: labels.ascending,
        descending: labels.descending,
        compactView: labels.compactView,
        tableView: labels.tableView,
        cardsView: labels.cardsView,
        sortBy: labels.sortBy,
        displayedColumns: labels.displayedColumns,
        hiddenInTable: labels.hiddenInTable,
        showAll: labels.showAll,
        hideAll: labels.hideAll,
        noColumnsDisplayed: labels.noColumnsDisplayed,
        toolbarMore: labels.toolbarMore,
        brandName: labels.brandName,
        createdAt: labels.createdAt,
        displayName: labels.displayName,
        legalName: labels.legalName,
        contactName: labels.contactName,
        email: labels.email,
        phone: labels.phone,
        location: labels.location,
        roles: labels.roles,
        typeOrganisation: labels.typeOrganisation,
        typePerson: labels.typePerson,
        itemsPerPage: labels.itemsPerPage,
      }}
      onClearSelection={selection.clearSelection}
      onPageSizeChange={onPageSizeChange}
      onSearchChange={onSearchChange}
      onSortByChange={onSortByChange}
      onSortOrderChange={onSortOrderChange}
      onTypeChange={onTypeChange}
      pageSize={display.pageSize}
      searchQuery={search}
      selectedCount={selection.selectedIds.size}
      setColumnOrder={display.setColumnOrder}
      setColumnVisibility={display.setColumnVisibility}
      setTableSize={display.setTableSize}
      setViewMode={display.setViewMode}
      sortBy={display.sortBy}
      sortOrder={display.sortOrder}
      tableSize={display.tableSize}
      totalCount={total}
      typeFilter={typeFilter}
      viewMode={display.viewMode}
    />
  );
}
