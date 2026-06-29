import { getApiBaseUrl, getCurrentAccessToken } from "@engenty/auth-ui";

export interface AuditLogEvent {
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

export interface AuditLogFiltersParams {
  actor_id?: string;
  date_from?: Date;
  date_to?: Date;
  module_id?: string;
  search?: string;
  types?: string[];
}

export interface AuditLogFilterOptions {
  module_ids: string[];
  types: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getCurrentAccessToken();
  if (!token) {
    throw new Error("Not authenticated.");
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getAuditEvents(
  params: {
    filters?: AuditLogFiltersParams;
    page?: number;
    limit?: number;
    tenantId?: string | null;
  },
  signal?: AbortSignal
) {
  const { filters = {}, page = 0, limit = 50, tenantId } = params;
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("page", String(page));
  if (tenantId) {
    q.set("tenant_id", tenantId);
  }
  if (filters.search) {
    q.set("search", filters.search);
  }
  if (filters.types?.length) {
    q.set("types", filters.types.join(","));
  }
  if (filters.actor_id) {
    q.set("actor_id", filters.actor_id);
  }
  if (filters.module_id) {
    q.set("module_id", filters.module_id);
  }
  if (filters.date_from) {
    q.set("from", filters.date_from.toISOString());
  }
  if (filters.date_to) {
    q.set("to", filters.date_to.toISOString());
  }
  const res = await request<{
    data?: { events: AuditLogEvent[]; has_more: boolean; total: number };
    events?: AuditLogEvent[];
    has_more?: boolean;
    total?: number;
  }>(`/api/security/audit/events?${q.toString()}`, { signal });
  if (res && typeof res === "object" && "data" in res && res.data) {
    return res.data;
  }
  return {
    events: (res as { events?: AuditLogEvent[] }).events ?? [],
    has_more: (res as { has_more?: boolean }).has_more ?? false,
    total: (res as { total?: number }).total ?? 0,
  };
}

export async function getAuditFilterOptions(
  tenantId?: string | null,
  signal?: AbortSignal
) {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await request<
    { data?: AuditLogFilterOptions } & Partial<AuditLogFilterOptions>
  >(`/api/security/audit/distincts${q}`, { signal });
  if (res && typeof res === "object" && "data" in res && res.data) {
    return res.data;
  }
  return {
    module_ids: (res as { module_ids?: string[] }).module_ids ?? [],
    types: (res as { types?: string[] }).types ?? [],
  };
}
