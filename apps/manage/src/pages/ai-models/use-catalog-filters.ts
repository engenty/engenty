import { useCallback, useEffect, useState } from "react";
import {
  CATALOG_FILTERS_DEFAULTS,
  type CatalogFiltersState,
  catalogFiltersAreDefault,
  loadCatalogFilters,
  saveCatalogFilters,
} from "./catalog-filters";

/**
 * Catalog search/filter state with localStorage persistence — load on mount,
 * save on change, reset clears storage.
 */
export function useCatalogFilters() {
  const [filters, setFilters] = useState<CatalogFiltersState>(() =>
    loadCatalogFilters()
  );

  useEffect(() => {
    saveCatalogFilters(filters);
  }, [filters]);

  const patch = useCallback((partial: Partial<CatalogFiltersState>) => {
    setFilters((current) => ({ ...current, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setFilters({ ...CATALOG_FILTERS_DEFAULTS });
  }, []);

  return {
    filters,
    hasActiveFilters: !catalogFiltersAreDefault(filters),
    patch,
    reset,
    setFilters,
  };
}
