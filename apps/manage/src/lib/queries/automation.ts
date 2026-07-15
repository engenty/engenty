import { queryOptions } from "@engenty/query-client";
import { listAutomationRules } from "../api/automation";

export const tenantAutomationRulesQuery = (tenantId: string) =>
  queryOptions({
    queryKey: ["manage", "tenants", tenantId, "automation-rules"],
    queryFn: ({ signal }) => listAutomationRules(tenantId, signal),
  });
