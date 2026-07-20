import type {
  MemoryConfidence,
  MemoryKind,
  MemoryRecord,
  MemoryScopeKind,
  MemorySourceKind,
  MemoryStatus,
} from "../schema/zod.js";

export type MemoryEventVerb = "created" | "updated" | "archived";

export interface MemoryEntityPayload extends Record<string, unknown> {
  record_id: string;
  scope_id: string;
  tenant_id: string;
}

/** Decouples the repo from the events runtime (tests pass a no-op). */
export type EmitMemoryEvent = (
  verb: MemoryEventVerb,
  payload: MemoryEntityPayload
) => Promise<void>;

export interface MemoryRecordUpsert {
  scope_kind: MemoryScopeKind;
  scope_ref: string | null;
  slug: string;
  title: string;
  body_md: string;
  kind: MemoryKind;
  confidence: MemoryConfidence;
  source_kind: MemorySourceKind;
  /** Force a status (org-scope agent writes are forced to 'proposed'). */
  status?: MemoryStatus;
  agent_type_key?: string | null;
  created_by?: string | null;
  supersedes?: string | null;
}

export interface MemoryRecordListFilter {
  scope_kind?: MemoryScopeKind;
  scope_ref?: string | null;
  kind?: MemoryKind;
  status?: MemoryStatus;
  limit?: number;
}

export interface MemoryRepo {
  /**
   * Upsert by (scope_kind, scope_ref, slug) within the repo's tenant+scope.
   * Re-saving an existing slug updates title/body/kind/confidence and keeps
   * the row id stable. Returns the stored record.
   */
  upsert(input: MemoryRecordUpsert): Promise<MemoryRecord>;
  getById(id: string): Promise<MemoryRecord | null>;
  list(filter?: MemoryRecordListFilter): Promise<MemoryRecord[]>;
  /** Soft delete: status → 'archived'. Never hard-deletes. */
  archive(id: string): Promise<MemoryRecord>;
  /** Approve a proposed record: status → 'active' (org governance). */
  approve(id: string): Promise<MemoryRecord>;
}
