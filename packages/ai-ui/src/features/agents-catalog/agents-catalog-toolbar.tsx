// Catalog toolbar: search with embedded filter toggle, count, view switcher,
// and an expandable filter bar row — mirrors the tasks list toolbar pattern.

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
  AGENT_GROUP_LABEL_KEYS,
  type AgentGroupFilter,
  type AgentSourceFilter,
} from "./agents-catalog-state";

interface AgentsCatalogToolbarProps {
  agentCount: number;
  filtersExpanded: boolean;
  groupFilter: AgentGroupFilter;
  hasActiveFilters: boolean;
  onFiltersToggle: () => void;
  onGroupFilterChange: (value: AgentGroupFilter) => void;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: AgentSourceFilter) => void;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  sourceFilter: AgentSourceFilter;
  viewMode: ViewMode;
}

export function AgentsCatalogToolbar({
  agentCount,
  filtersExpanded,
  groupFilter,
  hasActiveFilters,
  onFiltersToggle,
  onGroupFilterChange,
  onSearchChange,
  onSourceFilterChange,
  onViewModeChange,
  searchQuery,
  sourceFilter,
  viewMode,
}: AgentsCatalogToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const groupOptions = [
    { label: t("agentsCatalog.filter.allGroups"), value: "all" },
    {
      label: t(AGENT_GROUP_LABEL_KEYS.leadership),
      value: "leadership",
    },
    {
      label: t(AGENT_GROUP_LABEL_KEYS.specialists),
      value: "specialists",
    },
    {
      label: t(AGENT_GROUP_LABEL_KEYS.chat_surfaces),
      value: "chat_surfaces",
    },
    {
      label: t(AGENT_GROUP_LABEL_KEYS.external),
      value: "external",
    },
    {
      label: t(AGENT_GROUP_LABEL_KEYS.custom),
      value: "custom",
    },
  ];
  const sourceOptions = [
    { label: t("agentsCatalog.filter.allSources"), value: "all" },
    { label: t("agentsCatalog.source.builtin"), value: "builtin" },
    { label: t("agentsCatalog.source.module"), value: "module" },
    { label: t("agentsCatalog.source.custom"), value: "custom" },
  ];

  const activeGroupLabel = groupOptions.find(
    (o) => o.value === groupFilter
  )?.label;
  const activeSourceLabel = sourceOptions.find(
    (o) => o.value === sourceFilter
  )?.label;

  return (
    <ListToolbar className="shrink-0">
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full pr-10"
            onChange={(e) => onSearchChange(e.target.value)}
            onOpenFilters={() => {
              if (!filtersExpanded) {
                onFiltersToggle();
              }
            }}
            placeholder={t("agentsCatalog.searchPlaceholder")}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={filtersExpanded || hasActiveFilters}
            aria-label={t("agentsCatalog.filter.group")}
            aria-pressed={filtersExpanded}
            onClick={onFiltersToggle}
            showDot={hasActiveFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>
          {agentCount} {agentCount === 1 ? "agent" : "agents"}
        </ListToolbarSummary>
      </ListToolbarMainArea>

      <ListToolbarActions>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("agentsCatalog.cardsView"),
              table: t("agentsCatalog.tableView"),
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
            activeLabel={activeGroupLabel}
            ariaLabel={t("agentsCatalog.filter.group")}
            clearLabel={t("agentsCatalog.filter.clear")}
            isActive={groupFilter !== "all"}
            label={t("agentsCatalog.filter.group")}
            onClear={() => onGroupFilterChange("all")}
            onSelect={(next) => onGroupFilterChange(next as AgentGroupFilter)}
            options={groupOptions}
            value={groupFilter}
          />

          <ListFilterChip
            activeLabel={activeSourceLabel}
            ariaLabel={t("agentsCatalog.filter.source")}
            clearLabel={t("agentsCatalog.filter.clear")}
            isActive={sourceFilter !== "all"}
            label={t("agentsCatalog.filter.source")}
            onClear={() => onSourceFilterChange("all")}
            onSelect={(next) => onSourceFilterChange(next as AgentSourceFilter)}
            options={sourceOptions}
            value={sourceFilter}
          />

          {hasActiveFilters ? (
            <Button
              className="h-8 px-2 text-sm"
              onClick={() => {
                onGroupFilterChange("all");
                onSourceFilterChange("all");
              }}
              size="sm"
              type="button"
              variant="link"
            >
              {t("agentsCatalog.filter.clear")}
            </Button>
          ) : null}
        </ListToolbarFilterRow>
      ) : null}
    </ListToolbar>
  );
}
