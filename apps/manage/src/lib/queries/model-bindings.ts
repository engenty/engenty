import { queryOptions } from "@engenty/query-client";
import { listModelBindings } from "@/lib/api/model-bindings";

export const modelBindingKeys = {
  all: ["manage", "model-bindings"] as const,
};

export const modelBindingsQuery = queryOptions({
  queryKey: modelBindingKeys.all,
  queryFn: ({ signal }) => listModelBindings(signal),
  staleTime: 30_000,
});
