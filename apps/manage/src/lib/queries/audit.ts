import { keepPreviousData, queryOptions } from "@engenty/query-client";
import {
  type AuditEventsParams,
  listAuditDistincts,
  listAuditEvents,
} from "../api/audit";

export function auditEventsQuery(params: AuditEventsParams) {
  return queryOptions({
    queryKey: ["manage", "audit", "events", params],
    queryFn: ({ signal }) => listAuditEvents(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function auditDistinctsQuery(tenantId?: string) {
  return queryOptions({
    queryKey: ["manage", "audit", "distincts", tenantId ?? null],
    queryFn: ({ signal }) => listAuditDistincts(tenantId, signal),
  });
}
