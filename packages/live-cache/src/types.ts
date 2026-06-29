export interface LiveCacheContext {
  routeParams?: Record<string, string | undefined>;
  scopeId?: string;
  tenantId: string;
  userId?: string;
}

export type LiveQueryKey = readonly unknown[];

/**
 * Which column the realtime subscription filters and validates by.
 * - "tenant" (default): rows carry `tenant_id` (every module table).
 * - "user": rows carry `user_id` but no `tenant_id` (e.g. core.user_settings),
 *   so they're filtered/accepted per-user instead of per-tenant.
 */
export type LiveScope = "tenant" | "user";

export interface PostgresChangeSpec {
  event?: "*" | "INSERT" | "UPDATE" | "DELETE";
  filter?: string;
  schema: string;
  scope?: LiveScope;
  table: string;
}

export interface PostgresChangeSignal {
  eventType?: string;
  kind: "postgres_changes";
  record?: Record<string, unknown>;
  schema: string;
  table: string;
  tenantId?: string | null;
  userId?: string | null;
}

export type LiveSignal = PostgresChangeSignal;

export interface LiveCacheBinding {
  id: string;
  postgresChanges?: PostgresChangeSpec[];
  resolveQueryKeys: (
    ctx: LiveCacheContext,
    signal: LiveSignal
  ) => readonly LiveQueryKey[];
}
