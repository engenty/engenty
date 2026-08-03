// Toolbar for the tools catalog: search, source filter chip, view switcher.

import { useTranslation } from "@engenty/i18n/ui";
import {
  ListFilterChip,
  ListSearchInput,
  ListToolbar,
  ListToolbarActions,
  ListToolbarIdleControls,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListViewModeToggle,
  type ViewMode,
} from "@engenty/ui-core";
import type { ToolSourceFilter } from "./tools-catalog-state";

interface ToolsCatalogToolbarProps {
  onSearchChange: (value: string) => void;
  onSourceFilterChange: (value: ToolSourceFilter) => void;
  onViewModeChange: (mode: ViewMode) => void;
  searchQuery: string;
  sourceFilter: ToolSourceFilter;
  viewMode: ViewMode;
}

export function ToolsCatalogToolbar({
  onSearchChange,
  onSourceFilterChange,
  onViewModeChange,
  searchQuery,
  sourceFilter,
  viewMode,
}: ToolsCatalogToolbarProps) {
  const { t } = useTranslation("ai-ui");

  const sourceOptions = [
    { label: t("toolsCatalog.filter.allSources"), value: "all" },
    { label: t("toolsCatalog.source.module"), value: "module" },
    { label: t("toolsCatalog.source.mcp"), value: "mcp" },
    { label: t("toolsCatalog.source.custom"), value: "custom" },
  ];

  return (
    <ListToolbar className="shrink-0">
      <ListToolbarMainArea>
        <ListToolbarSearch>
          <ListSearchInput
            className="w-full"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={t("toolsCatalog.searchPlaceholder")}
            value={searchQuery}
            wrapperClassName="w-full"
          />
        </ListToolbarSearch>
        <ListFilterChip
          ariaLabel={t("toolsCatalog.filter.source")}
          clearLabel={t("toolsCatalog.filter.clear")}
          isActive={sourceFilter !== "all"}
          label={t("toolsCatalog.filter.source")}
          onClear={() => onSourceFilterChange("all")}
          onSelect={(next) => onSourceFilterChange(next as ToolSourceFilter)}
          options={sourceOptions}
          value={sourceFilter}
        />
      </ListToolbarMainArea>

      <ListToolbarActions>
        <ListToolbarIdleControls>
          <ListViewModeToggle
            labels={{
              cards: t("toolsCatalog.cardsView"),
              group: t("toolsCatalog.viewMode"),
              table: t("toolsCatalog.tableView"),
            }}
            onChange={onViewModeChange}
            value={viewMode}
          />
        </ListToolbarIdleControls>
      </ListToolbarActions>
    </ListToolbar>
  );
}
