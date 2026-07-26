import { queryOptions } from "@engenty/query-client";
import {
  type AiGatewayModelFilters,
  listGatewayModelSyncRuns,
  listGatewayModels,
  listModelPricingHistory,
} from "../api/ai-models";

/** Invalidated after every availability patch and catalog sync. */
export const AI_MODELS_QUERY_KEY = ["manage", "ai-models"] as const;

export const gatewayModelsQuery = (filters: AiGatewayModelFilters) =>
  queryOptions({
    queryKey: [...AI_MODELS_QUERY_KEY, "catalog", filters],
    queryFn: ({ signal }) => listGatewayModels(filters, signal),
  });

export const gatewayModelSyncRunsQuery = (limit = 20) =>
  queryOptions({
    queryKey: [...AI_MODELS_QUERY_KEY, "sync-runs", limit],
    queryFn: ({ signal }) => listGatewayModelSyncRuns(limit, signal),
  });

export const modelPricingHistoryQuery = queryOptions({
  queryKey: [...AI_MODELS_QUERY_KEY, "pricing-history"],
  queryFn: ({ signal }) => listModelPricingHistory(signal),
});
