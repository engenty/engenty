import {
  Button,
  type ColumnConfig,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  ListDisplayConfigurator,
  ListSearchInput,
  ListToolbarIconButton,
  ListViewModeToggle,
  type SortOrder,
  type TableSize,
  type ViewMode,
} from "@engenty/ui-core";
import {
  Boxes,
  CircleDot,
  Clock,
  FileText,
  Layers3,
  ListFilter,
  SlidersHorizontal,
  Tag,
  Terminal,
  X,
} from "lucide-react";
import type {
  SkillCatalogGroupBy,
  SkillCatalogOriginFilter,
  SkillCatalogSortBy,
  SkillCatalogTierFilter,
} from "./skills-catalog-state";

export type SkillCatalogColumnKey =
  | "skill"
  | "module"
  | "sandbox"
  | "status"
  | "tools"
  | "updated";

export type SkillCatalogColumnVisibility = Record<
  SkillCatalogColumnKey,
  boolean
>;

interface SkillCatalogToolbarLabels {
  ascending: string;
  cardsView: string;
  columnSandbox: string;
  columnTools: string;
  compactView: string;
  descending: string;
  display: string;
  displayedColumns: string;
  filterAllModules: string;
  filterToggle: string;
  groupBy: string;
  groupByModule: string;
  groupByNone: string;
  groupBySource: string;
  groupByTier: string;
  hiddenInTable: string;
  hideAll: string;
  module: string;
  noColumnsDisplayed: string;
  origin: string;
  originAll: string;
  originCore: string;
  originModule: string;
  originTenant: string;
  paginationSummary: string;
  searchPlaceholder: string;
  showAll: string;
  sortBy: string;
  sortByModule: string;
  sortByName: string;
  sortByUpdated: string;
  tableView: string;
  tier: string;
  tierAll: string;
  tierCustom: string;
  tierManaged: string;
}

interface SkillCatalogToolbarProps {
  columnOrder: SkillCatalogColumnKey[];
  columnVisibility: SkillCatalogColumnVisibility;
  filtersExpanded: boolean;
  groupBy: SkillCatalogGroupBy;
  hasActiveFilters: boolean;
  labels: SkillCatalogToolbarLabels;
  moduleFilter: string;
  moduleOptions: { label: string; value: string }[];
  onFiltersToggle: () => void;
  onGroupByChange: (value: SkillCatalogGroupBy) => void;
  onModuleFilterChange: (value: string) => void;
  onOriginFilterChange: (value: SkillCatalogOriginFilter) => void;
  onSearchChange: (value: string) => void;
  onSortByChange: (value: SkillCatalogSortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
  onTierFilterChange: (value: SkillCatalogTierFilter) => void;
  originFilter: SkillCatalogOriginFilter;
  searchQuery: string;
  setColumnOrder: (order: SkillCatalogColumnKey[]) => void;
  setColumnVisibility: (value: SkillCatalogColumnVisibility) => void;
  setTableSize: (size: TableSize) => void;
  setViewMode: (mode: ViewMode) => void;
  sortBy: SkillCatalogSortBy;
  sortOrder: SortOrder;
  tableSize: TableSize;
  tierFilter: SkillCatalogTierFilter;
  viewMode: ViewMode;
}

const FILTER_CHIP_CN =
  "h-8 shrink-0 gap-1 rounded-full border px-3 text-sm shadow-none [box-shadow:var(--shadow-ember-elevated)] focus-visible:ring-0";

function FilterChip({
  activeLabel,
  ariaLabel,
  clearLabel,
  isActive,
  label,
  onClear,
  onSelect,
  options,
  value,
}: {
  activeLabel?: string;
  ariaLabel: string;
  clearLabel: string;
  isActive: boolean;
  label: string;
  onClear: () => void;
  onSelect: (next: string) => void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className={cn(
            FILTER_CHIP_CN,
            isActive
              ? "border-primary/30 bg-accent text-foreground hover:bg-accent"
              : "border-card bg-card text-muted-foreground hover:bg-card hover:text-foreground"
          )}
          size="sm"
          type="button"
          variant="outline"
        >
          <span className="max-w-[12rem] truncate">
            {isActive && activeLabel ? activeLabel : label}
          </span>
          {isActive ? (
            <span
              aria-label={clearLabel}
              className="inline-flex shrink-0 rounded-sm hover:text-foreground"
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onClear();
                }
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClear();
              }}
              role="button"
              tabIndex={0}
            >
              <X aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[11rem]">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {label}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup onValueChange={onSelect} value={value}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              closeOnClick
              key={option.value}
              value={option.value}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkillCatalogToolbar({
  columnOrder,
  columnVisibility,
  filtersExpanded,
  groupBy,
  hasActiveFilters,
  labels,
  moduleFilter,
  moduleOptions,
  onFiltersToggle,
  onGroupByChange,
  onModuleFilterChange,
  onOriginFilterChange,
  onSearchChange,
  onSortByChange,
  onSortOrderChange,
  onTierFilterChange,
  originFilter,
  searchQuery,
  setColumnOrder,
  setColumnVisibility,
  setTableSize,
  setViewMode,
  sortBy,
  sortOrder,
  tableSize,
  tierFilter,
  viewMode,
}: SkillCatalogToolbarProps) {
  const columns: ColumnConfig<SkillCatalogColumnKey>[] = [
    { key: "skill", label: labels.sortByName, icon: FileText },
    { key: "module", label: labels.module, icon: Boxes },
    { key: "sandbox", label: labels.columnSandbox, icon: Terminal },
    { key: "status", label: labels.tier, icon: CircleDot },
    { key: "tools", label: labels.columnTools, icon: Tag },
    { key: "updated", label: labels.sortByUpdated, icon: Clock },
  ];
  const sortOptions = [
    { label: labels.sortByName, value: "name" as const },
    { label: labels.sortByModule, value: "module" as const },
    { label: labels.sortByUpdated, value: "updated_at" as const },
  ];
  const groupByOptions = [
    { label: labels.groupByModule, value: "module" },
    { label: labels.groupBySource, value: "source" },
    { label: labels.groupByTier, value: "tier" },
    { label: labels.groupByNone, value: "none" },
  ];
  const originOptions = [
    { label: labels.originAll, value: "all" },
    { label: labels.originCore, value: "core" },
    { label: labels.originModule, value: "module" },
    { label: labels.originTenant, value: "tenant" },
  ];
  const tierOptions = [
    { label: labels.tierAll, value: "all" },
    { label: labels.tierManaged, value: "managed" },
    { label: labels.tierCustom, value: "custom" },
  ];

  const selectedModuleLabel = moduleOptions.find(
    (option) => option.value === moduleFilter
  )?.label;
  const selectedOriginLabel = originOptions.find(
    (option) => option.value === originFilter
  )?.label;
  const selectedTierLabel = tierOptions.find(
    (option) => option.value === tierFilter
  )?.label;

  return (
    <div className="shrink-0 space-y-2">
      <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="relative w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
            <ListSearchInput
              className="w-full pr-10"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={labels.searchPlaceholder}
              value={searchQuery}
              wrapperClassName="w-full"
            />
            <ListToolbarIconButton
              aria-label={labels.filterToggle}
              aria-pressed={filtersExpanded}
              className={cn(
                "absolute top-1/2 right-1 -translate-y-1/2",
                (filtersExpanded || hasActiveFilters) && "text-foreground"
              )}
              onClick={onFiltersToggle}
              type="button"
            >
              <span className="relative inline-flex">
                <ListFilter className="h-4 w-4" />
                {hasActiveFilters ? (
                  <span
                    aria-hidden
                    className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </span>
            </ListToolbarIconButton>
          </div>
          <p className="min-w-0 shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
            {labels.paginationSummary}
          </p>
        </div>

        <ListViewModeToggle
          labels={{ cards: labels.cardsView, table: labels.tableView }}
          onChange={setViewMode}
          value={viewMode}
        />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <ListToolbarIconButton aria-label={labels.display} type="button">
              <SlidersHorizontal />
            </ListToolbarIconButton>
          </DropdownMenuTrigger>
          <ListDisplayConfigurator<SkillCatalogColumnKey, SkillCatalogSortBy>
            columnOrder={columnOrder}
            columns={columns}
            columnVisibility={columnVisibility}
            groupBy={groupBy}
            groupByOptions={groupByOptions}
            labels={{
              ascending: labels.ascending,
              cards: labels.cardsView,
              compactView: labels.compactView,
              descending: labels.descending,
              displayedInTable: labels.displayedColumns,
              groupBy: labels.groupBy,
              hiddenInTable: labels.hiddenInTable,
              hideAll: labels.hideAll,
              noColumnsDisplayed: labels.noColumnsDisplayed,
              showAll: labels.showAll,
              sortBy: labels.sortBy,
              table: labels.tableView,
            }}
            setColumnOrder={setColumnOrder}
            setColumnVisibility={setColumnVisibility}
            setGroupBy={(value) =>
              onGroupByChange(value as SkillCatalogGroupBy)
            }
            setSortBy={onSortByChange}
            setSortOrder={onSortOrderChange}
            setTableSize={setTableSize}
            setViewMode={setViewMode}
            sortBy={sortBy}
            sortOptions={sortOptions}
            sortOrder={sortOrder}
            tableSize={tableSize}
            viewMode={viewMode}
            viewModes={["table", "cards"]}
          />
        </DropdownMenu>
      </div>

      {filtersExpanded ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-muted-foreground text-sm">
            {labels.groupBy}
          </span>
          <FilterChip
            activeLabel={
              groupByOptions.find((option) => option.value === groupBy)?.label
            }
            ariaLabel={labels.groupBy}
            clearLabel={labels.groupByNone}
            isActive={groupBy !== "none"}
            label={labels.groupByNone}
            onClear={() => onGroupByChange("none")}
            onSelect={(value) => onGroupByChange(value as SkillCatalogGroupBy)}
            options={groupByOptions}
            value={groupBy}
          />
          <span
            aria-hidden
            className="hidden h-4 w-px shrink-0 bg-border sm:block"
          />
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
            <Layers3 className="h-4 w-4" />
          </span>
          <FilterChip
            activeLabel={selectedOriginLabel}
            ariaLabel={labels.origin}
            clearLabel={labels.originAll}
            isActive={originFilter !== "all"}
            label={labels.origin}
            onClear={() => onOriginFilterChange("all")}
            onSelect={(value) =>
              onOriginFilterChange(value as SkillCatalogOriginFilter)
            }
            options={originOptions}
            value={originFilter}
          />
          <FilterChip
            activeLabel={selectedTierLabel}
            ariaLabel={labels.tier}
            clearLabel={labels.tierAll}
            isActive={tierFilter !== "all"}
            label={labels.tier}
            onClear={() => onTierFilterChange("all")}
            onSelect={(value) =>
              onTierFilterChange(value as SkillCatalogTierFilter)
            }
            options={tierOptions}
            value={tierFilter}
          />
          <FilterChip
            activeLabel={selectedModuleLabel}
            ariaLabel={labels.module}
            clearLabel={labels.filterAllModules}
            isActive={moduleFilter !== "all"}
            label={labels.module}
            onClear={() => onModuleFilterChange("all")}
            onSelect={onModuleFilterChange}
            options={moduleOptions}
            value={moduleFilter}
          />
        </div>
      ) : null}
    </div>
  );
}
