import type { SecurityAuditEvent } from "./audit-log.js";

export type SourceKind = "core" | "module";

export interface AuditEventRow {
  actor_id: string | null;
  detail: string;
  id: string;
  module_id: string | null;
  operation_id: string | null;
  source_component: string | null;
  source_kind: SourceKind;
  source_module_id: string | null;
  tenant_id: string | null;
  timestamp: string;
  type: string;
}

export interface AuditContext {
  component?: string | null;
}

export type AuditEventPayload = Omit<SecurityAuditEvent, "id" | "timestamp"> & {
  source_component?: string | null;
  source_kind?: SourceKind;
  source_module_id?: string | null;
};

export interface PushEventInput
  extends Omit<SecurityAuditEvent, "id" | "timestamp"> {
  source_component?: string | null;
  source_kind?: SourceKind;
  source_module_id?: string | null;
}

export interface ListOptions {
  actor_id?: string;
  from?: string;
  limit?: number;
  module_id?: string;
  offset?: number;
  search?: string;
  tenant_id?: string;
  to?: string;
  types?: string[];
}

export interface AuditFilterDistincts {
  module_ids: string[];
  types: string[];
}
