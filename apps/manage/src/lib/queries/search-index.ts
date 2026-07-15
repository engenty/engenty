import { queryOptions } from "@engenty/query-client";
import {
  getSearchProviderStatus,
  listSearchProviders,
} from "../api/search-index";

export const searchProvidersQuery = queryOptions({
  queryKey: ["manage", "search-index", "providers"],
  queryFn: ({ signal }) => listSearchProviders(signal),
});

export const searchProviderStatusQuery = (id: string) =>
  queryOptions({
    queryKey: ["manage", "search-index", "status", id],
    queryFn: ({ signal }) => getSearchProviderStatus(id, signal),
    enabled: Boolean(id),
  });
