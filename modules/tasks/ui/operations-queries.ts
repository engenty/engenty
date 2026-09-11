import { queryOptions } from "@engenty/query-client";
import { getDispatchStatus } from "./lib/operations-api.js";

export const operationsKeys = {
  all: ["tasks", "operations"] as const,
  dispatch: () => [...operationsKeys.all, "dispatch"] as const,
};

export function dispatchStatusOptions() {
  return queryOptions({
    queryKey: operationsKeys.dispatch(),
    queryFn: ({ signal }) => getDispatchStatus(signal),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}
