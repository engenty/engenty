import { queryOptions } from "@engenty/query-client";
import { getManageFlags } from "../api/feature-flags";

export const featureFlagsQuery = (tenantId?: string) =>
  queryOptions({
    queryKey: ["manage", "flags", tenantId ?? "global"],
    queryFn: ({ signal }) => getManageFlags(tenantId, signal),
  });
