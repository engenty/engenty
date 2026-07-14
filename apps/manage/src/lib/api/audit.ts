import { request } from "./http";

export interface AuditEvent {
  actor_id: string | null;
  detail: Record<string, unknown>;
  id: string;
  module_id: string | null;
  operation_id: string | null;
  source_component: string | null;
  source_kind: "core" | "module";
  source_module_id: string | null;
  tenant_id: string | null;
  timestamp: string;
  type: string;
}

export interface AuditDistincts {
  module_ids: string[];
  types: string[];
}

export interface AuditEventsParams {
  actor_id?: string;
  from?: string;
  module_id?: string;
  page?: number;
  search?: string;
  tenant_id?: string;
  to?: string;
  types?: string[];
}

export interface AuditEventsResult {
  events: AuditEvent[];
  has_more: boolean;
  total: number;
}

const AUDIT_PAGE_SIZE = 100;

function toQuery(params: AuditEventsParams): string {
  const query = new URLSearchParams();
  query.set("limit", String(AUDIT_PAGE_SIZE));
  query.set("page", String(params.page ?? 0));
  if (params.tenant_id) {
    query.set("tenant_id", params.tenant_id);
  }
  if (params.search) {
    query.set("search", params.search);
  }
  if (params.types?.length) {
    query.set("types", params.types.join(","));
  }
  if (params.actor_id) {
    query.set("actor_id", params.actor_id);
  }
  if (params.module_id) {
    query.set("module_id", params.module_id);
  }
  if (params.from) {
    query.set("from", params.from);
  }
  if (params.to) {
    query.set("to", params.to);
  }
  return query.toString();
}

export function listAuditEvents(
  params: AuditEventsParams,
  signal?: AbortSignal
) {
  return request<AuditEventsResult>(
    `/api/superadmin/audit/events?${toQuery(params)}`,
    { signal }
  );
}

export function listAuditDistincts(tenantId?: string, signal?: AbortSignal) {
  const suffix = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  return request<AuditDistincts>(`/api/superadmin/audit/distincts${suffix}`, {
    signal,
  });
}

export { AUDIT_PAGE_SIZE };
