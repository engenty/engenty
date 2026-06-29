import { queryOptions, useQuery } from "@engenty/query-client";
import { getWorkspaceContext } from "@/lib/api/client";

export const workspaceContextOptions = queryOptions({
  queryKey: ["workspace-context"],
  queryFn: ({ signal }) => getWorkspaceContext(signal),
  staleTime: 5 * 60_000,
  /** Avoid refetch-on-focus racing user-settings PATCH and reverting theme/language via AppearanceBootstrap. */
  refetchOnWindowFocus: false,
});

export function useWorkspaceContextQuery(enabled: boolean) {
  return useQuery({
    ...workspaceContextOptions,
    enabled,
  });
}
