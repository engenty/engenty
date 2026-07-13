import { queryOptions } from "@engenty/query-client";
import { getTenantEntitlements, listPackages } from "../api/entitlements";

export const packagesQuery = queryOptions({
  queryKey: ["manage", "packages"],
  queryFn: ({ signal }) => listPackages(signal),
});

export const tenantEntitlementsQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["manage", "tenants", tenantId, "entitlements"],
    queryFn: ({ signal }) => getTenantEntitlements(tenantId, signal),
  });
