import { cn, ListSearchInput, ListToolbarIconButton } from "@engenty/ui-core";
import { ListFilter } from "lucide-react";

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
    <div className="flex min-w-0 flex-col gap-2 sm:gap-3 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-full min-w-0 max-w-full sm:max-w-md md:max-w-lg lg:max-w-xl">
          <ListSearchInput
            className="w-full pr-10"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            value={searchQuery}
            wrapperClassName="w-full"
          />
          <ListToolbarIconButton
            aria-label={toggleFiltersLabel}
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
          {summary}
        </p>
      </div>
    </div>
  );
}
