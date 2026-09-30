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
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!isAdmin) {
    return true;
  }
  if (query.isPending) {
    return;
  }
  // A failed read must not lock the team out of its own app.
  if (query.isError) {
    return true;
  }
  return "value" in query.data && query.data.value === true;
}
