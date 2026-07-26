import { queryOptions, useQuery } from "@engenty/query-client";
import { tenantUsagePolicyKeys } from "../../lib/admin/ai-settings-queries.js";
import { getTenantUsagePolicy } from "../../lib/admin/usage-policy-api.js";
import { isEffortRestricted } from "./effort-choices.js";

/**
 * The tenant's licensed effort tiers, for any surface that offers an effort
 * choice.
 *
 * Shares the AI-settings policy query key, so an admin who already loaded
 * /settings/ai pays nothing extra. The read is currently tenant-admin scoped
 * (`GET /ai/v1/usage/policy` → 403 for members), so a failure is treated as
 * "unrestricted": the composer must not lose its tiers because a member cannot
 * see the policy, and the service clamps the request anyway. Retries are off —
 * a 403 will not become a 200 on the second try.
 */
export function useEffortGrant(): {
  allowedEfforts: readonly string[] | null;
  isRestricted: boolean;
} {
  const query = useQuery(
    queryOptions({
      queryKey: tenantUsagePolicyKeys.all,
      queryFn: ({ signal }) => getTenantUsagePolicy(signal),
      retry: false,
      staleTime: 5 * 60_000,
    })
  );
  const allowedEfforts = query.data?.allowed_efforts ?? null;
  return {
    allowedEfforts,
    isRestricted: isEffortRestricted(allowedEfforts),
  };
}
