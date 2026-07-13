import { queryOptions } from "@engenty/query-client";
import { getTenant, listTenantMembers, listTenants } from "../api/tenants";

export const tenantsQuery = queryOptions({
  queryKey: ["manage", "tenants"],
  queryFn: ({ signal }) => listTenants(signal),
});

export const tenantQuery = (id: string) =>
  queryOptions({
    queryKey: ["manage", "tenants", id],
    queryFn: ({ signal }) => getTenant(id, signal),
  });

export const tenantMembersQuery = (id: string) =>
  queryOptions({
    queryKey: ["manage", "tenants", id, "members"],
    queryFn: ({ signal }) => listTenantMembers(id, signal),
  });
