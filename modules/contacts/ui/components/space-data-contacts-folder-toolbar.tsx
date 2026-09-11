import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  type ColumnConfig,
  DropdownMenu,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
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
import { Mail, SlidersHorizontal, Type } from "lucide-react";

export type ContactsFolderColumn = "email" | "name";

export function ContactsFolderListToolbar({
  columnOrder,
  columnVisibility,
  onSearchChange,
  searchQuery,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  setViewMode,
  sortBy,
  sortOrder,
  summary,
  tableSize,
  viewMode,
}: {
  columnOrder: ContactsFolderColumn[];
  columnVisibility: Record<ContactsFolderColumn, boolean>;
  onSearchChange: (value: string) => void;
  searchQuery: string;
  setColumnOrder: (order: ContactsFolderColumn[]) => void;
  setColumnVisibility: (value: Record<ContactsFolderColumn, boolean>) => void;
  setSortBy: (value: ContactsFolderColumn) => void;
  setSortOrder: (value: SortOrder) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ContactsFolderColumn;
  sortOrder: SortOrder;
  summary: string;
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation("contacts");
  const columns: ColumnConfig<ContactsFolderColumn>[] = [
    { icon: Type, key: "name", label: t("displayName") },
    { icon: Mail, key: "email", label: t("email") },
  ];
  const sortOptions = [
    { label: t("displayName"), value: "name" as const },
    { label: t("email"), value: "email" as const },
  ];

  return (
    <ListToolbar>
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("spaceData.folder.searchPlaceholder", {
              defaultValue: "Search contacts…",
            })}
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <ListToolbarSummary>{summary}</ListToolbarSummary>
      </ListToolbarMainArea>
      <ListToolbarActions moreLabel={t("toolbarMore")}>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("cardsView"),
              table: t("tableView"),
            }}
            onChange={setViewMode}
            value={viewMode}
          />
          <ListToolbarOverflowItem>
            <ContactsFolderDisplayMenu
              columnOrder={columnOrder}
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnOrder={setColumnOrder}
              setColumnVisibility={setColumnVisibility}
              setSortBy={setSortBy}
              setSortOrder={setSortOrder}
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
    </ListToolbar>
  );
}

function ContactsFolderDisplayMenu({
  columnOrder,
  columns,
  columnVisibility,
  setColumnOrder,
  setColumnVisibility,
  setSortBy,
  setSortOrder,
  setTableSize,
  setViewMode,
  sortBy,
  sortOptions,
  sortOrder,
  tableSize,
  viewMode,
}: {
  columnOrder: ContactsFolderColumn[];
  columns: ColumnConfig<ContactsFolderColumn>[];
  columnVisibility: Record<ContactsFolderColumn, boolean>;
  setColumnOrder: (order: ContactsFolderColumn[]) => void;
  setColumnVisibility: (value: Record<ContactsFolderColumn, boolean>) => void;
  setSortBy: (value: ContactsFolderColumn) => void;
  setSortOrder: (value: SortOrder) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ContactsFolderColumn;
  sortOptions: { label: string; value: ContactsFolderColumn }[];
  sortOrder: SortOrder;
  tableSize: TableSize;
  viewMode: ViewMode;
}) {
  const { t } = useTranslation("contacts");
  const { overflowPlacement } = useListToolbar();
  const inMenu = overflowPlacement === "menu";
  const displayLabel = t("spaceData.folder.display", {
    defaultValue: "Display",
  });

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {inMenu ? (
          <Button
            aria-label={displayLabel}
            className="h-9 w-full justify-start gap-1.5"
            size="sm"
            type="button"
            variant="ghost"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {displayLabel}
          </Button>
        ) : (
          <ListToolbarIconButton aria-label={displayLabel} type="button">
            <SlidersHorizontal />
          </ListToolbarIconButton>
        )}
      </DropdownMenuTrigger>
      <ListDisplayConfigurator<ContactsFolderColumn, ContactsFolderColumn>
        columnOrder={columnOrder}
        columns={columns}
        columnVisibility={columnVisibility}
        labels={{
          ascending: t("ascending"),
          cards: t("cardsView"),
          descending: t("descending"),
          displayedInTable: t("displayedColumns"),
          hiddenInTable: t("hiddenInTable"),
          hideAll: t("hideAll"),
          noColumnsDisplayed: t("noColumnsDisplayed"),
          showAll: t("showAll"),
          sortBy: t("spaceData.folder.sortBy", { defaultValue: "Sort by" }),
          table: t("tableView"),
        }}
        setColumnOrder={setColumnOrder}
        setColumnVisibility={setColumnVisibility}
        setSortBy={setSortBy}
        setSortOrder={setSortOrder}
        setTableSize={setTableSize}
        setViewMode={setViewMode}
        sortBy={sortBy}
        sortOptions={sortOptions}
        sortOrder={sortOrder}
        tableSize={tableSize}
        viewMode={viewMode}
      />
    </DropdownMenu>
  );
}
