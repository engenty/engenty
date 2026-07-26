import {
  AI_MODEL_PRICE_TIERS,
  AI_MODEL_USE_CASES,
  type AiModelPriceTier,
  type AiModelUseCase,
} from "@/lib/api/ai-models";
import {
  ACTIVATION_FILTERS,
  type ActivationFilter,
  RELEASE_AGE_FILTERS,
  type ReleaseAgeFilter,
} from "./model-catalog";

export const CATALOG_FILTERS_STORAGE_KEY = "manage.ai-models.filters";

export const ALL = "all";

export interface CatalogFiltersState {
  activationFilter: ActivationFilter;
  gateway: string;
  maxOutputDollars: string;
  maxPriceTier: AiModelPriceTier | typeof ALL;
  provider: string;
  releaseAgeFilter: ReleaseAgeFilter;
  search: string;
  useCase: AiModelUseCase | typeof ALL;
  webSearchOnly: boolean;
}

export const CATALOG_FILTERS_DEFAULTS: CatalogFiltersState = {
  activationFilter: ALL,
  gateway: ALL,
  maxOutputDollars: "",
  maxPriceTier: ALL,
  provider: ALL,
  releaseAgeFilter: ALL,
  search: "",
  useCase: ALL,
  webSearchOnly: false,
};

function isActivationFilter(value: unknown): value is ActivationFilter {
  return (
    typeof value === "string" &&
    (ACTIVATION_FILTERS as readonly string[]).includes(value)
  );
}

function isReleaseAgeFilter(value: unknown): value is ReleaseAgeFilter {
  return (
    typeof value === "string" &&
    (RELEASE_AGE_FILTERS as readonly string[]).includes(value)
  );
}

function isUseCase(value: unknown): value is AiModelUseCase | typeof ALL {
  return (
    value === ALL ||
    (typeof value === "string" &&
      (AI_MODEL_USE_CASES as readonly string[]).includes(value))
  );
}

function isPriceTier(value: unknown): value is AiModelPriceTier | typeof ALL {
  return (
    value === ALL ||
    (typeof value === "string" &&
      (AI_MODEL_PRICE_TIERS as readonly string[]).includes(value))
  );
}

/** Merge a raw storage payload onto defaults; unknown/invalid fields are ignored. */
export function parseCatalogFilters(raw: unknown): CatalogFiltersState {
  if (!raw || typeof raw !== "object") {
    return { ...CATALOG_FILTERS_DEFAULTS };
  }
  const stored = raw as Record<string, unknown>;
  return {
    activationFilter: isActivationFilter(stored.activationFilter)
      ? stored.activationFilter
      : CATALOG_FILTERS_DEFAULTS.activationFilter,
    gateway:
      typeof stored.gateway === "string" && stored.gateway.trim()
        ? stored.gateway
        : CATALOG_FILTERS_DEFAULTS.gateway,
    maxOutputDollars:
      typeof stored.maxOutputDollars === "string"
        ? stored.maxOutputDollars
        : CATALOG_FILTERS_DEFAULTS.maxOutputDollars,
    maxPriceTier: isPriceTier(stored.maxPriceTier)
      ? stored.maxPriceTier
      : CATALOG_FILTERS_DEFAULTS.maxPriceTier,
    provider:
      typeof stored.provider === "string" && stored.provider.trim()
        ? stored.provider
        : CATALOG_FILTERS_DEFAULTS.provider,
    releaseAgeFilter: isReleaseAgeFilter(stored.releaseAgeFilter)
      ? stored.releaseAgeFilter
      : CATALOG_FILTERS_DEFAULTS.releaseAgeFilter,
    search:
      typeof stored.search === "string"
        ? stored.search
        : CATALOG_FILTERS_DEFAULTS.search,
    useCase: isUseCase(stored.useCase)
      ? stored.useCase
      : CATALOG_FILTERS_DEFAULTS.useCase,
    webSearchOnly:
      typeof stored.webSearchOnly === "boolean"
        ? stored.webSearchOnly
        : CATALOG_FILTERS_DEFAULTS.webSearchOnly,
  };
}

export function catalogFiltersAreDefault(state: CatalogFiltersState) {
  return (
    state.activationFilter === CATALOG_FILTERS_DEFAULTS.activationFilter &&
    state.gateway === CATALOG_FILTERS_DEFAULTS.gateway &&
    state.maxOutputDollars === CATALOG_FILTERS_DEFAULTS.maxOutputDollars &&
    state.maxPriceTier === CATALOG_FILTERS_DEFAULTS.maxPriceTier &&
    state.provider === CATALOG_FILTERS_DEFAULTS.provider &&
    state.releaseAgeFilter === CATALOG_FILTERS_DEFAULTS.releaseAgeFilter &&
    state.search === CATALOG_FILTERS_DEFAULTS.search &&
    state.useCase === CATALOG_FILTERS_DEFAULTS.useCase &&
    state.webSearchOnly === CATALOG_FILTERS_DEFAULTS.webSearchOnly
  );
}

export function loadCatalogFilters(
  storageKey = CATALOG_FILTERS_STORAGE_KEY
): CatalogFiltersState {
  if (typeof window === "undefined") {
    return { ...CATALOG_FILTERS_DEFAULTS };
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return { ...CATALOG_FILTERS_DEFAULTS };
    }
    return parseCatalogFilters(JSON.parse(raw) as unknown);
  } catch {
    return { ...CATALOG_FILTERS_DEFAULTS };
  }
}

export function saveCatalogFilters(
  state: CatalogFiltersState,
  storageKey = CATALOG_FILTERS_STORAGE_KEY
) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (catalogFiltersAreDefault(state)) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // quota / private mode
  }
}
