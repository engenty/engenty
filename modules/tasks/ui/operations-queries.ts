import { queryOptions } from "@engenty/query-client";
import { getGoals } from "./api.js";
import { getDispatchStatus } from "./lib/operations-api.js";

export const operationsKeys = {
  all: ["tasks", "operations"] as const,
  dispatch: () => [...operationsKeys.all, "dispatch"] as const,
  activeGoals: () => [...operationsKeys.all, "active-goals"] as const,
};

export function dispatchStatusOptions() {
  return queryOptions({
    queryKey: operationsKeys.dispatch(),
    queryFn: ({ signal }) => getDispatchStatus(signal),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function activeGoalsOptions() {
  return queryOptions({
    queryKey: operationsKeys.activeGoals(),
    queryFn: ({ signal }) => getGoals({ status: "active" }, signal),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
