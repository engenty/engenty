import { queryOptions } from "@engenty/query-client";
import { listInvoices } from "../api/billing";

export const invoicesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["manage", "tenants", tenantId, "invoices"],
    queryFn: ({ signal }) => listInvoices(tenantId, signal),
  });
