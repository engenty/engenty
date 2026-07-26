import type { SortOrder } from "@engenty/ui-core";
import type {
  AiGatewayModel,
  AiModelAvailabilityFlags,
  AiModelPriceTier,
} from "@/lib/api/ai-models";

export const MICROS_PER_DOLLAR = 1_000_000;

export type ActivationFilter = "active" | "all" | "inactive";
export type ReleaseAgeFilter = "all" | "month" | "quarter" | "week" | "year";
export type ActivationStatus = "active" | "custom" | "inactive";

export type CatalogSortColumn =
  | "activated"
  | "model"
  | "output_price"
  | "price_tier"
  | "provider"
  | "released_at";

export interface CatalogColumnVisibility {
  activated: boolean;
  cachedPrice: boolean;
  capabilities: boolean;
  context: boolean;
  inputPrice: boolean;
  model: boolean;
  outputPrice: boolean;
  priceTier: boolean;
  releaseDate: boolean;
  useCase: boolean;
}

export type CatalogColumnKey = keyof CatalogColumnVisibility;

export const CATALOG_SORT_COLUMNS: readonly CatalogSortColumn[] = [
  "activated",
  "model",
  "provider",
  "price_tier",
  "output_price",
  "released_at",
];

export const CATALOG_DISPLAY_DEFAULTS = {
  columnOrder: [
    "activated",
    "model",
    "useCase",
    "priceTier",
    "context",
    "releaseDate",
    "capabilities",
    "inputPrice",
    "outputPrice",
    "cachedPrice",
  ] as CatalogColumnKey[],
  columnVisibility: {
    activated: true,
    cachedPrice: true,
    capabilities: true,
    context: true,
    inputPrice: true,
    model: true,
    outputPrice: true,
    priceTier: true,
    releaseDate: true,
    useCase: true,
  },
  sortBy: "model" as CatalogSortColumn,
  sortOrder: "asc" as SortOrder,
  tableSize: "compact" as const,
  viewMode: "table" as const,
};

const ACTIVATION_FLAG_KEYS: (keyof AiModelAvailabilityFlags)[] = [
  "available_for_chat",
  "available_for_routing",
  "available_for_embedding",
  "available_for_image",
  "available_for_video",
  "available_for_rerank",
];

const RELEASE_AGE_MS: Record<ReleaseAgeFilter, number | null> = {
  all: null,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  quarter: 90 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

export const RELEASE_AGE_FILTERS: readonly ReleaseAgeFilter[] = [
  "all",
  "week",
  "month",
  "quarter",
  "year",
];

export const ACTIVATION_FILTERS: readonly ActivationFilter[] = [
  "all",
  "active",
  "inactive",
];

export function formatMicros(
  value: number | null | undefined,
  currency = "usd"
) {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value / MICROS_PER_DOLLAR);
}

export function formatTokens(value: number | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Intl.NumberFormat().format(value);
}

/** Free-text dollar filter → micros; blank or nonsense means "no filter". */
export function dollarsToMicros(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return;
  }
  return Math.round(parsed * MICROS_PER_DOLLAR);
}

/**
 * One activation checkbox stands in for six availability purposes: the model's
 * declared use-cases decide which purposes it can serve. Text/code models get
 * both chat and routing, everything else follows its single matching purpose.
 */
export function activationFlagsForModel(
  model: Pick<AiGatewayModel, "use_cases">,
  activated: boolean
): AiModelAvailabilityFlags {
  if (!activated) {
    return {
      available_for_chat: false,
      available_for_embedding: false,
      available_for_image: false,
      available_for_rerank: false,
      available_for_routing: false,
      available_for_video: false,
    };
  }
  const textReady =
    model.use_cases.includes("text") || model.use_cases.includes("code");
  return {
    available_for_chat: textReady,
    available_for_embedding: model.use_cases.includes("embed"),
    available_for_image: model.use_cases.includes("image"),
    available_for_rerank: model.use_cases.includes("rerank"),
    available_for_routing: textReady,
    available_for_video: model.use_cases.includes("video"),
  };
}

export function isModelActivated(flags: AiModelAvailabilityFlags) {
  return ACTIVATION_FLAG_KEYS.some((key) => flags[key]);
}

/**
 * "custom" means someone set the flags by hand (or through an older ruleset):
 * the model is on, but not with the exact flags this page would derive.
 */
export function activationStatus(model: AiGatewayModel): ActivationStatus {
  if (!isModelActivated(model)) {
    return "inactive";
  }
  const expected = activationFlagsForModel(model, true);
  return ACTIVATION_FLAG_KEYS.some((key) => model[key] !== expected[key])
    ? "custom"
    : "active";
}

export function isWithinReleaseAge(
  model: Pick<AiGatewayModel, "released_at">,
  filter: ReleaseAgeFilter,
  nowMs: number
) {
  const maxAgeMs = RELEASE_AGE_MS[filter];
  if (!maxAgeMs) {
    return true;
  }
  if (!model.released_at) {
    return false;
  }
  const releasedAtMs = new Date(model.released_at).getTime();
  return Number.isFinite(releasedAtMs) && releasedAtMs >= nowMs - maxAgeMs;
}

export function priceTierBadgeClassName(tier: AiModelPriceTier | null) {
  switch (tier) {
    case "cheap":
      return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-400";
    case "low":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "medium":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400";
    case "high":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400";
    case "expensive":
      return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

export function activationBadgeClassName(status: ActivationStatus) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "custom":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400";
    default:
      return "border-muted bg-muted text-muted-foreground";
  }
}

export function syncStatusBadgeClassName(
  status: "failed" | "running" | "succeeded"
) {
  switch (status) {
    case "failed":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400";
    case "running":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400";
    default:
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400";
  }
}

function compareNullableNumber(
  left: number | null | undefined,
  right: number | null | undefined
) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  return left - right;
}

export function sortGatewayModels(
  models: AiGatewayModel[],
  sortBy: CatalogSortColumn,
  sortOrder: SortOrder
) {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...models].sort((left, right) => {
    const result =
      sortBy === "activated"
        ? Number(isModelActivated(right)) - Number(isModelActivated(left))
        : sortBy === "model"
          ? (left.display_name ?? left.model_id).localeCompare(
              right.display_name ?? right.model_id
            )
          : sortBy === "provider"
            ? left.provider.localeCompare(right.provider)
            : sortBy === "price_tier"
              ? String(left.price_tier ?? "").localeCompare(
                  String(right.price_tier ?? "")
                )
              : sortBy === "output_price"
                ? compareNullableNumber(
                    left.output_per_mtok_micros,
                    right.output_per_mtok_micros
                  )
                : String(left.released_at ?? "").localeCompare(
                    String(right.released_at ?? "")
                  );
    // Stable tiebreaker so equal keys keep a deterministic order.
    return result * direction || left.model_id.localeCompare(right.model_id);
  });
}

/**
 * Pricing + availability snapshot of the visible catalog, in the shape the AI
 * service's pricing seed file expects — so a download can be committed back as
 * the new defaults.
 */
export function pricingSeedsFromModels(models: AiGatewayModel[]) {
  return models.map((model) => ({
    model_id: model.model_id,
    currency: "usd",
    input_per_mtok_micros: model.input_per_mtok_micros ?? 0,
    output_per_mtok_micros: model.output_per_mtok_micros ?? 0,
    cached_input_per_mtok_micros: model.cached_input_per_mtok_micros ?? 0,
    reasoning_per_mtok_micros: model.output_per_mtok_micros ?? 0,
    available_for_chat: model.available_for_chat,
    available_for_embedding: model.available_for_embedding,
    available_for_image: model.available_for_image,
    available_for_rerank: model.available_for_rerank,
    available_for_routing: model.available_for_routing,
    available_for_video: model.available_for_video,
  }));
}
