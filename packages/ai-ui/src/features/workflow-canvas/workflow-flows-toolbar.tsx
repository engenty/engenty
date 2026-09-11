// Toolbar for the Flows catalog: search, filter row, view switcher.
//
// Same shape as every other Engenty catalog: the main bar carries only what you
// always need (search, how many, which view), and the filters live in the row
// behind the filter toggle. Filters in the main bar crowd out the summary and
// make a two-filter list look busier than a six-filter one.
import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  ListFilterChip,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarFilterRow,
  ListToolbarFilterToggle,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
  ListViewModeToggle,
  type ViewMode,
} from "@engenty/ui-core";
import { ListFilter } from "lucide-react";
import {
  FLOW_FILTER_ALL,
  FLOW_SUBJECT_NONE,
  type FlowSourceFilter,
  type FlowStatusFilter,
} from "./workflow-flows-state.js";

interface WorkflowLibraryToolbarProps {
  filtersExpanded: boolean;
  onFiltersToggle: () => void;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: FlowSourceFilter) => void;
  onStatusFilterChange: (value: FlowStatusFilter) => void;
  onSubjectFilterChange: (value: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  shownCount: number;
  sourceFilter: FlowSourceFilter;
  statusFilter: FlowStatusFilter;
  subjectFilter: string;
  /** Subjects present in the data; the chip is hidden when there are none. */
  subjects: string[];
  totalCount: number;
  viewMode: ViewMode;
}

export function WorkflowLibraryToolbar({
  filtersExpanded,
  onFiltersToggle,
  onSearchChange,
  onSourceFilterChange,
  onStatusFilterChange,
  onSubjectFilterChange,
  onViewModeChange,
  searchQuery,
  shownCount,
  sourceFilter,
  statusFilter,
  subjectFilter,
  subjects,
  totalCount,
  viewMode,
}: WorkflowLibraryToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const statusOptions = [
    { label: t("workflows.filter.allStatuses"), value: FLOW_FILTER_ALL },
    { label: t("workflows.status.active"), value: "active" },
    { label: t("workflows.status.draft"), value: "draft" },
    { label: t("workflows.status.declared"), value: "declared" },
    { label: t("workflows.status.disabled"), value: "disabled" },
  ];
  const sourceOptions = [
    { label: t("workflows.filter.allSources"), value: FLOW_FILTER_ALL },
    { label: t("workflows.source.module"), value: "module" },
    { label: t("workflows.source.authored"), value: "authored" },
  ];
  const subjectOptions = [
    { label: t("workflows.filter.allSubjects"), value: FLOW_FILTER_ALL },
    ...subjects.map((value) => ({ label: value, value })),
    { label: t("workflows.filter.noSubject"), value: FLOW_SUBJECT_NONE },
  ];
  const hasActiveFilters =
    statusFilter !== FLOW_FILTER_ALL ||
    subjectFilter !== FLOW_FILTER_ALL ||
    sourceFilter !== FLOW_FILTER_ALL;

  const clearAll = () => {
    onStatusFilterChange(FLOW_FILTER_ALL);
    onSubjectFilterChange(FLOW_FILTER_ALL);
    onSourceFilterChange(FLOW_FILTER_ALL);
  };

  return (
    <ListToolbar className="shrink-0">
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full pr-10"
            onChange={(event) => onSearchChange(event.target.value)}
            onOpenFilters={() => {
              if (!filtersExpanded) {
                onFiltersToggle();
              }
            }}
            placeholder={t("workflows.searchPlaceholder")}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={filtersExpanded || hasActiveFilters}
            aria-label={t("workflows.filter.group")}
            aria-pressed={filtersExpanded}
            onClick={onFiltersToggle}
            showDot={hasActiveFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {shownCount === totalCount
            ? t("workflows.count", { count: totalCount })
            : t("workflows.countFiltered", {
                count: shownCount,
                total: totalCount,
              })}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("workflows.cardsView"),
              group: t("workflows.viewMode"),
              table: t("workflows.tableView"),
            }}
            onChange={onViewModeChange}
            value={viewMode}
          />
        </ListToolbarIdleControls>
      </ListToolbarActions>

      {filtersExpanded ? (
        <ListToolbarFilterRow>
          <span
            aria-hidden
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
              hasActiveFilters && "text-foreground"
            )}
          >
            <span className="relative inline-flex">
              <ListFilter className="h-4 w-4" />
              {hasActiveFilters ? (
                <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
              ) : null}
            </span>
          </span>

          <ListFilterChip
            ariaLabel={t("workflows.filter.status")}
            clearLabel={t("workflows.filter.clear")}
            isActive={statusFilter !== FLOW_FILTER_ALL}
            label={t("workflows.filter.status")}
            onClear={() => onStatusFilterChange(FLOW_FILTER_ALL)}
            onSelect={(next) => onStatusFilterChange(next as FlowStatusFilter)}
            options={statusOptions}
            value={statusFilter}
          />

          <ListFilterChip
            ariaLabel={t("workflows.filter.source")}
            clearLabel={t("workflows.filter.clear")}
            isActive={sourceFilter !== FLOW_FILTER_ALL}
            label={t("workflows.filter.source")}
            onClear={() => onSourceFilterChange(FLOW_FILTER_ALL)}
            onSelect={(next) => onSourceFilterChange(next as FlowSourceFilter)}
            options={sourceOptions}
            value={sourceFilter}
          />

          {subjects.length > 0 ? (
            <ListFilterChip
              ariaLabel={t("workflows.filter.subject")}
              clearLabel={t("workflows.filter.clear")}
              isActive={subjectFilter !== FLOW_FILTER_ALL}
              label={t("workflows.filter.subject")}
              onClear={() => onSubjectFilterChange(FLOW_FILTER_ALL)}
              onSelect={onSubjectFilterChange}
              options={subjectOptions}
              value={subjectFilter}
            />
          ) : null}

          {hasActiveFilters ? (
            <Button
              className="h-8 px-2 text-sm"
              onClick={clearAll}
              size="sm"
              type="button"
              variant="link"
            >
              {t("workflows.filter.clear")}
            </Button>
          ) : null}
        </ListToolbarFilterRow>
      ) : null}
    </ListToolbar>
  );
}
