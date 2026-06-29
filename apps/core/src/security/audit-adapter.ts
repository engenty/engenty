import { initEvlog, log } from "../observability/evlog.js";
import type { SecurityAuditEvent } from "./audit-log.js";
import { createAuditStoreSupabase } from "./audit-supabase.js";
import type {
  AuditEventRow,
  AuditFilterDistincts,
  ListOptions,
  PushEventInput,
} from "./audit-types.js";

export interface SecurityAuditLogAdapter {
  count(options?: Omit<ListOptions, "limit" | "offset">): Promise<number>;
  distincts(tenant_id?: string): Promise<AuditFilterDistincts>;
  list(limit?: number, options?: ListOptions): Promise<AuditEventRow[]>;
  push(
    event: Omit<SecurityAuditEvent, "id" | "timestamp"> | PushEventInput
  ): void;
}

export interface CreatePersistentAuditLogParams {
  config?: Record<string, unknown>;
  dataDir: string;
  maxRows?: number;
  onPushError?: (err: unknown) => void;
}

/** No-op audit log for tests when Supabase is not available. */
export function createNoopAuditLog(): SecurityAuditLogAdapter {
  return {
    push() {},
    async list() {
      return [];
    },
    async count() {
      return 0;
    },
    async distincts() {
      return { types: [], module_ids: [] };
    },
  };
}

export function createPersistentAuditLog(
  dataDirOrParams: string | CreatePersistentAuditLogParams,
  options?: { maxRows?: number; onPushError?: (err: unknown) => void }
): SecurityAuditLogAdapter {
  const params =
    typeof dataDirOrParams === "string"
      ? { dataDir: dataDirOrParams, ...options }
      : dataDirOrParams;
  const { config, maxRows, onPushError } = params;

  const store = createAuditStoreSupabase(config ?? {}, { maxRows });

  const onError =
    onPushError ??
    ((err) => {
      initEvlog();
      log.error(
        "audit",
        `push failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

  return {
    push(event: Omit<SecurityAuditEvent, "id" | "timestamp"> | PushEventInput) {
      void store.push(event).catch(onError);
    },
    list(limit = 200, options?: ListOptions) {
      return store.list(limit, options);
    },
    count(options?: Omit<ListOptions, "limit" | "offset">) {
      return store.count(options);
    },
    distincts(tenant_id?: string) {
      return store.distincts(tenant_id);
    },
  };
}
