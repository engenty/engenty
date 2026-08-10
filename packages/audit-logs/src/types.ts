/**
 * Display-oriented audit log event for UI consumption.
 * Aligns with engenty core SecurityAuditEvent + source context (snake_case).
 */
export interface AuditLogEvent {
  actor_id?: string | null;
  detail?: Record<string, unknown>;
  id: string;
  module_id?: string | null;
  operation_id?: string | null;
  source_component?: string | null;
  source_kind?: "core" | "module";
  source_module_id?: string | null;
  tenant_id?: string | null;
  timestamp: string;
  type: string;
  user?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    initials?: string | null;
  } | null;
}

export interface AuditLogFilters {
  actor_id?: string;
  date_from?: Date;
  date_to?: Date;
  module_id?: string;
  search?: string;
  types?: string[];
}

/** Alias for AuditLogFilters (used by audit-api). */
export type AuditLogFiltersParams = AuditLogFilters;

export interface AuditLogFetchResult {
  events: AuditLogEvent[];
  has_more: boolean;
}

export interface AuditLogFilterOptions {
  module_ids: string[];
  types: string[];
}

export type FetchAuditEventsFn = (
  filters: AuditLogFilters,
  page: number,
  signal?: AbortSignal
) => Promise<AuditLogFetchResult>;

export type FetchFilterOptionsFn = (
  signal?: AbortSignal
) => Promise<AuditLogFilterOptions>;

export interface AuditLogLabels {
  allTypes?: string;
  clearFilters?: string;
  columnActor?: string;
  columnEvent?: string;
  columnSource?: string;
  columnStatus?: string;
  columnTime?: string;
  entries?: string;
  feedPaused?: string;
  from?: string;
  metadata?: string;
  newEvents?: string;
  noLogs?: string;
  realtimeConnected?: string;
  resume?: string;
  searchPlaceholder?: string;
  targetType?: string;
  to?: string;
}
