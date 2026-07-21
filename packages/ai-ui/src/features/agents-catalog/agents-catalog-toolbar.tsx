// Catalog toolbar: search with embedded filter toggle, count, view switcher,
// and an expandable filter bar row — mirrors the tasks list toolbar pattern.

import { useTranslation } from "@engenty/i18n/ui";
import {
  Button,
  cn,
  ListFilterChip,
  ListIconSegmentToggle,
  ListSearchInput,
  ListToolbarIconButton,
  type ViewMode,
} from "@engenty/ui-core";
import { LayoutGrid, List, ListFilter } from "lucide-react";
import type {
  AgentRoleFilter,
  AgentSourceFilter,
} from "./agents-catalog-state";

interface AgentsCatalogToolbarProps {
  agentCount: number;
  filtersExpanded: boolean;
  hasActiveFilters: boolean;
  onFiltersToggle: () => void;
  onRoleFilterChange: (value: AgentRoleFilter) => void;
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: AgentSourceFilter) => void;
  onViewModeChange: (mode: ViewMode) => void;
  roleFilter: AgentRoleFilter;
  searchQuery: string;
  sourceFilter: AgentSourceFilter;
  viewMode: ViewMode;
}

export function AgentsCatalogToolbar({
  agentCount,
  filtersExpanded,
  hasActiveFilters,
  onFiltersToggle,
  onRoleFilterChange,
  onSearchChange,
  onSourceFilterChange,
  onViewModeChange,
  roleFilter,
  searchQuery,
  sourceFilter,
  viewMode,
}: AgentsCatalogToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const roleOptions = [
    { label: t("agentsCatalog.filter.allRoles"), value: "all" },
    { label: t("agentsCatalog.role.copilot"), value: "copilot" },
    { label: t("agentsCatalog.role.specialist"), value: "specialist" },
    { label: t("agentsCatalog.role.chatSurface"), value: "chat_surface" },
    { label: t("agentsCatalog.role.external"), value: "external" },
  ];
  const sourceOptions = [
    { label: t("agentsCatalog.filter.allSources"), value: "all" },
    { label: t("agentsCatalog.source.builtin"), value: "builtin" },
    { label: t("agentsCatalog.source.module"), value: "module" },
    { label: t("agentsCatalog.source.custom"), value: "custom" },
  ];

  const activeRoleLabel = roleOptions.find(
    (o) => o.value === roleFilter
  )?.label;
  const activeSourceLabel = sourceOptions.find(
    (o) => o.value === sourceFilter
  )?.label;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {/* Row 1: search + count + view toggle */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md md:max-w-lg">
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
          <ListToolbarIconButton
            aria-label={t("agentsCatalog.filter.role")}
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

        <p className="shrink-0 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
          {agentCount} {agentCount === 1 ? "agent" : "agents"}
        </p>

        <div className="ml-auto shrink-0">
          <ListIconSegmentToggle<ViewMode>
            onChange={(next) => {
              if (next !== "") {
                onViewModeChange(next as ViewMode);
              }
            }}
            segments={[
              {
                value: "table",
                label: t("agentsCatalog.tableView"),
                icon: List,
              },
              {
                value: "cards",
                label: t("agentsCatalog.cardsView"),
                icon: LayoutGrid,
              },
            ]}
            value={viewMode}
          />
        </div>
      </div>

      {/* Row 2: filter chips (expandable) */}
      {filtersExpanded ? (
        <div className="flex flex-wrap items-center gap-2">
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
            activeLabel={activeRoleLabel}
            ariaLabel={t("agentsCatalog.filter.role")}
            clearLabel={t("agentsCatalog.filter.clear")}
            isActive={roleFilter !== "all"}
            label={t("agentsCatalog.filter.role")}
            onClear={() => onRoleFilterChange("all")}
            onSelect={(next) => onRoleFilterChange(next as AgentRoleFilter)}
            options={roleOptions}
            value={roleFilter}
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
                onRoleFilterChange("all");
                onSourceFilterChange("all");
              }}
              size="sm"
              type="button"
              variant="link"
            >
              {t("agentsCatalog.filter.clear")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
