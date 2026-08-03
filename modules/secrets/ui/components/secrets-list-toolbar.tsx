import {
  ListSearchInput,
  ListToolbar,
  ListToolbarFilterToggle,
  ListToolbarMainArea,
  ListToolbarSearch,
  ListToolbarSummary,
} from "@engenty/ui-core";

interface SecretsListToolbarProps {
  filtersExpanded: boolean;
  hasActiveFilters: boolean;
  onFiltersToggle: () => void;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchQuery: string;
  summary: string;
  toggleFiltersLabel: string;
}

export function SecretsListToolbar({
  searchQuery,
  onSearchChange,
  searchPlaceholder,
  summary,
  filtersExpanded,
  onFiltersToggle,
  hasActiveFilters,
  toggleFiltersLabel,
}: SecretsListToolbarProps) {
  return (
    <ListToolbar>
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
            placeholder={searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarFilterToggle
            active={filtersExpanded || hasActiveFilters}
            aria-label={toggleFiltersLabel}
            aria-pressed={filtersExpanded}
            onClick={onFiltersToggle}
            showDot={hasActiveFilters}
          />
        </ListToolbarSearch>
        <ListToolbarSummary>{summary}</ListToolbarSummary>
      </ListToolbarMainArea>
    </ListToolbar>
  );
}
