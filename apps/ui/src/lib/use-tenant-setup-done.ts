import { TENANT_SETUP_DONE_SETTING } from "@engenty/auth-ui";
import { useQuery } from "@engenty/query-client";
import { getTenantSetting } from "@/lib/api/client";

/**
 * Whether the tenant finished its setup wizard. Only asked for its admins —
 * they are the ones the shell sends to `/welcome` until it has; everyone
 * else is `true`. `undefined` while the answer loads.
 */
export function useTenantSetupDone(isAdmin: boolean): boolean | undefined {
  const query = useQuery({
    enabled: isAdmin,
    queryFn: ({ signal }) =>
      getTenantSetting(TENANT_SETUP_DONE_SETTING, signal),
    queryKey: ["tenant-settings", TENANT_SETUP_DONE_SETTING],
    // The wizard writes the marker and navigates in-app; a cached "not done"
    // from before it would send the admin straight back to `/welcome`.
    refetchOnMount: "always",
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!isAdmin) {
    return true;
  }
  const done = query.data && "value" in query.data && query.data.value === true;
  // Not done in the cache: wait for the re-read before sending anyone back.
  if (query.isPending || (query.isFetching && !done)) {
    return;
  }
  // A failed read must not lock the team out of its own app.
  if (query.isError) {
    return true;
  }
  return Boolean(done);
}
