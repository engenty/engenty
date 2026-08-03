// Full toolbar for the artifacts catalog: search, filter toggle, view switch,
// display configurator (sort / group / columns / density) and an expandable
// row of filter chips (group-by + scope / type / storage / status / creator).

import { useTranslation } from "@engenty/i18n/ui";
import {
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
  type ViewMode,
} from "@engenty/ui-core";
import {
  Boxes,
  Clock,
  Database,
  FileStack,
  FileType,
  Layers,
  Shapes,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";
import type {
  ArtifactCreatorFilter,
  ArtifactGroupBy,
  ArtifactScopeFilter,
  ArtifactSortBy,
  ArtifactStatusFilter,
  ArtifactStorageFilter,
} from "./artifacts-catalog-state";

export type ArtifactColumnKey =
  | "title"
  | "scope"
  | "storage"
  | "type"
  | "version"
  | "updated"
  | "status"
  | "creator";

export type ArtifactColumnVisibility = Record<ArtifactColumnKey, boolean>;

export interface ArtifactsCatalogToolbarProps {
  columnOrder: ArtifactColumnKey[];
  columnVisibility: ArtifactColumnVisibility;
  creatorFilter: ArtifactCreatorFilter;
  filteredCount: number;
  filtersExpanded: boolean;
  groupBy: ArtifactGroupBy;
  hasActiveFilters: boolean;
  onCreatorFilterChange: (value: ArtifactCreatorFilter) => void;
  onFiltersToggle: () => void;
  onGroupByChange: (value: ArtifactGroupBy) => void;
  onScopeFilterChange: (value: ArtifactScopeFilter) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: ArtifactSortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onStatusFilterChange: (value: ArtifactStatusFilter) => void;
  onStorageFilterChange: (value: ArtifactStorageFilter) => void;
  onTypeFilterChange: (value: string) => void;
  scopeFilter: ArtifactScopeFilter;
  searchQuery: string;
  setColumnOrder: (order: ArtifactColumnKey[]) => void;
  setColumnVisibility: (value: ArtifactColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: ArtifactSortBy;
  sortOrder: SortOrder;
  statusFilter: ArtifactStatusFilter;
  storageFilter: ArtifactStorageFilter;
  tableSize: TableSize;
  totalCount: number;
  typeFilter: string;
  /** Distinct artifact types present, for the type filter chip. */
  typeOptions: string[];
  viewMode: ViewMode;
}

export function ArtifactsCatalogToolbar(props: ArtifactsCatalogToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const columns: ColumnConfig<ArtifactColumnKey>[] = [
    {
      key: "title",
      label: t("artifactsCatalog.column.title"),
      icon: FileStack,
    },
    { key: "scope", label: t("artifactsCatalog.column.scope"), icon: Shapes },
    {
      key: "storage",
      label: t("artifactsCatalog.column.storage"),
      icon: Database,
    },
    { key: "type", label: t("artifactsCatalog.column.type"), icon: FileType },
    { key: "version", label: t("artifactsCatalog.column.version"), icon: Tag },
    {
      key: "updated",
      label: t("artifactsCatalog.column.updated"),
      icon: Clock,
    },
    { key: "status", label: t("artifactsCatalog.column.status"), icon: Layers },
    {
      key: "creator",
      label: t("artifactsCatalog.column.creator"),
      icon: User,
    },
  ];

  const sortOptions = [
    { label: t("artifactsCatalog.sort.title"), value: "title" as const },
    { label: t("artifactsCatalog.sort.updated"), value: "updated_at" as const },
    { label: t("artifactsCatalog.sort.type"), value: "type" as const },
  ];

  const groupByOptions = [
    { label: t("artifactsCatalog.groupBy.scope"), value: "scope" },
    { label: t("artifactsCatalog.groupBy.type"), value: "type" },
    { label: t("artifactsCatalog.groupBy.storage"), value: "storage" },
    { label: t("artifactsCatalog.groupBy.status"), value: "status" },
    { label: t("artifactsCatalog.groupBy.creator"), value: "creator" },
    { label: t("artifactsCatalog.groupBy.none"), value: "none" },
  ];

  const scopeOptions = [
    { label: t("artifactsCatalog.filter.allScopes"), value: "all" },
    { label: t("artifactsCatalog.scope.thread"), value: "thread" },
    { label: t("artifactsCatalog.scope.task"), value: "task" },
    { label: t("artifactsCatalog.scope.project"), value: "project" },
    { label: t("artifactsCatalog.scope.goal"), value: "goal" },
  ];
  const typeChipOptions = [
    { label: t("artifactsCatalog.filter.allTypes"), value: "all" },
    ...props.typeOptions.map((type) => ({ label: type, value: type })),
  ];
  const storageOptions = [
    { label: t("artifactsCatalog.filter.allStorage"), value: "all" },
    { label: t("artifactsCatalog.storage.inline.label"), value: "inline" },
    { label: t("artifactsCatalog.storage.blob.label"), value: "blob" },
  ];
  const statusOptions = [
    { label: t("artifactsCatalog.statusValue.active"), value: "active" },
    { label: t("artifactsCatalog.statusValue.archived"), value: "archived" },
    { label: t("artifactsCatalog.filter.allStatus"), value: "all" },
  ];
  const creatorOptions = [
    { label: t("artifactsCatalog.filter.allCreators"), value: "all" },
    { label: t("artifactsCatalog.by.agent"), value: "agent" },
    { label: t("artifactsCatalog.by.user"), value: "user" },
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
            onChange={(event) => props.onSearchChange(event.target.value)}
            onOpenFilters={() => {
              if (!props.filtersExpanded) {
                props.onFiltersToggle();
              }
            }}
            placeholder={t("artifactsCatalog.searchPlaceholder")}
            value={props.searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={props.filtersExpanded || props.hasActiveFilters}
            aria-label={t("artifactsCatalog.filterToggle")}
            aria-pressed={props.filtersExpanded}
            onClick={props.onFiltersToggle}
            showDot={props.hasActiveFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {t("artifactsCatalog.count", {
            count: props.filteredCount,
            total: props.totalCount,
          })}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("artifactsCatalog.cardsView"),
              table: t("artifactsCatalog.tableView"),
            }}
            onChange={props.setViewMode}
            value={props.viewMode}
          />
          <ListToolbarOverflowItem>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <ListToolbarIconButton
                  aria-label={t("artifactsCatalog.display")}
                  type="button"
                >
                  <SlidersHorizontal />
                </ListToolbarIconButton>
              </DropdownMenuTrigger>
              <ListDisplayConfigurator<ArtifactColumnKey, ArtifactSortBy>
                columnOrder={props.columnOrder}
                columns={columns}
                columnVisibility={props.columnVisibility}
                groupBy={props.groupBy}
                groupByOptions={groupByOptions}
                labels={{
                  ascending: t("artifactsCatalog.sortAscending"),
                  cards: t("artifactsCatalog.cardsView"),
                  compactView: t("artifactsCatalog.compactView"),
                  descending: t("artifactsCatalog.sortDescending"),
                  displayedInTable: t("artifactsCatalog.displayedColumns"),
                  groupBy: t("artifactsCatalog.groupByLabel"),
                  hiddenInTable: t("artifactsCatalog.hiddenColumns"),
                  hideAll: t("artifactsCatalog.hideAll"),
                  noColumnsDisplayed: t("artifactsCatalog.noColumns"),
                  showAll: t("artifactsCatalog.showAll"),
                  sortBy: t("artifactsCatalog.sortByLabel"),
                  table: t("artifactsCatalog.tableView"),
                }}
                setColumnOrder={props.setColumnOrder}
                setColumnVisibility={props.setColumnVisibility}
                setGroupBy={(value) =>
                  props.onGroupByChange(value as ArtifactGroupBy)
                }
                setSortBy={props.onSortByChange}
                setSortOrder={props.onSortOrderChange}
                setTableSize={props.setTableSize}
                setViewMode={props.setViewMode}
                sortBy={props.sortBy}
                sortOptions={sortOptions}
                sortOrder={props.sortOrder}
                tableSize={props.tableSize}
                viewMode={props.viewMode}
                viewModes={["table", "cards"]}
              />
            </DropdownMenu>
          </ListToolbarOverflowItem>
        </ListToolbarIdleControls>
      </ListToolbarActions>

      {props.filtersExpanded ? (
        <ListToolbarFilterRow>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
            <Boxes className="h-4 w-4" />
          </span>
          <ListFilterChip
            activeLabel={labelFor(groupByOptions, props.groupBy)}
            ariaLabel={t("artifactsCatalog.groupByLabel")}
            clearLabel={t("artifactsCatalog.groupBy.none")}
            isActive={props.groupBy !== "scope"}
            label={t("artifactsCatalog.groupByLabel")}
            onClear={() => props.onGroupByChange("scope")}
            onSelect={(value) =>
              props.onGroupByChange(value as ArtifactGroupBy)
            }
            options={groupByOptions}
            value={props.groupBy}
          />
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-border sm:block"
          />
          <ListFilterChip
            activeLabel={labelFor(scopeOptions, props.scopeFilter)}
            ariaLabel={t("artifactsCatalog.filter.scope")}
            clearLabel={t("artifactsCatalog.filter.allScopes")}
            isActive={props.scopeFilter !== "all"}
            label={t("artifactsCatalog.filter.scope")}
            onClear={() => props.onScopeFilterChange("all")}
            onSelect={(value) =>
              props.onScopeFilterChange(value as ArtifactScopeFilter)
            }
            options={scopeOptions}
            value={props.scopeFilter}
          />
          <ListFilterChip
            activeLabel={labelFor(typeChipOptions, props.typeFilter)}
            ariaLabel={t("artifactsCatalog.filter.type")}
            clearLabel={t("artifactsCatalog.filter.allTypes")}
            isActive={props.typeFilter !== "all"}
            label={t("artifactsCatalog.filter.type")}
            onClear={() => props.onTypeFilterChange("all")}
            onSelect={props.onTypeFilterChange}
            options={typeChipOptions}
            value={props.typeFilter}
          />
          <ListFilterChip
            activeLabel={labelFor(storageOptions, props.storageFilter)}
            ariaLabel={t("artifactsCatalog.filter.storage")}
            clearLabel={t("artifactsCatalog.filter.allStorage")}
            isActive={props.storageFilter !== "all"}
            label={t("artifactsCatalog.filter.storage")}
            onClear={() => props.onStorageFilterChange("all")}
            onSelect={(value) =>
              props.onStorageFilterChange(value as ArtifactStorageFilter)
            }
            options={storageOptions}
            value={props.storageFilter}
          />
          <ListFilterChip
            activeLabel={labelFor(statusOptions, props.statusFilter)}
            ariaLabel={t("artifactsCatalog.filter.status")}
            clearLabel={t("artifactsCatalog.statusValue.active")}
            isActive={props.statusFilter !== "active"}
            label={t("artifactsCatalog.filter.status")}
            onClear={() => props.onStatusFilterChange("active")}
            onSelect={(value) =>
              props.onStatusFilterChange(value as ArtifactStatusFilter)
            }
            options={statusOptions}
            value={props.statusFilter}
          />
          <ListFilterChip
            activeLabel={labelFor(creatorOptions, props.creatorFilter)}
            ariaLabel={t("artifactsCatalog.filter.creator")}
            clearLabel={t("artifactsCatalog.filter.allCreators")}
            isActive={props.creatorFilter !== "all"}
            label={t("artifactsCatalog.filter.creator")}
            onClear={() => props.onCreatorFilterChange("all")}
            onSelect={(value) =>
              props.onCreatorFilterChange(value as ArtifactCreatorFilter)
            }
            options={creatorOptions}
            value={props.creatorFilter}
          />
        </ListToolbarFilterRow>
      ) : null}
    </ListToolbar>
  );
}
