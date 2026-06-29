import type { QueryClient } from "@engenty/query-client";
import type { createDebouncedInvalidator } from "./debounced-invalidate.js";
import type {
  LiveCacheBinding,
  LiveCacheContext,
  LiveSignal,
  PostgresChangeSpec,
} from "./types.js";

/** Find the change spec on a binding that the signal's table matches. */
function findMatchingChange(
  binding: LiveCacheBinding,
  signal: LiveSignal
): PostgresChangeSpec | undefined {
  if (signal.kind !== "postgres_changes") {
    return;
  }
  return (binding.postgresChanges ?? []).find(
    (change) => change.schema === signal.schema && change.table === signal.table
  );
}

export function matchesPostgresBinding(
  binding: LiveCacheBinding,
  signal: LiveSignal
): boolean {
  return findMatchingChange(binding, signal) !== undefined;
}

export function shouldAcceptSignalForTenant(
  ctx: LiveCacheContext,
  signal: LiveSignal
): boolean {
  if (!signal.tenantId) {
    return false;
  }
  return signal.tenantId === ctx.tenantId;
}

/** User-scoped acceptance: only this user's rows, matched by `user_id`. */
export function shouldAcceptSignalForUser(
  ctx: LiveCacheContext,
  signal: LiveSignal
): boolean {
  if (!(signal.userId && ctx.userId)) {
    return false;
  }
  return signal.userId === ctx.userId;
}

/** Accept a signal according to the matched binding's scope (tenant default). */
export function shouldAcceptSignalForScope(
  ctx: LiveCacheContext,
  signal: LiveSignal,
  scope: PostgresChangeSpec["scope"]
): boolean {
  return scope === "user"
    ? shouldAcceptSignalForUser(ctx, signal)
    : shouldAcceptSignalForTenant(ctx, signal);
}

export function createLiveCacheRegistry(bindings: LiveCacheBinding[]) {
  return {
    bindings,
    handleSignal(
      queryClient: QueryClient,
      ctx: LiveCacheContext,
      signal: LiveSignal,
      invalidate: ReturnType<typeof createDebouncedInvalidator>
    ) {
      const keys = new Set<string>();
      for (const binding of bindings) {
        const change = findMatchingChange(binding, signal);
        if (!change) {
          continue;
        }
        // Accept per the matched table's scope: tenant rows by tenant_id,
        // user-scoped rows (e.g. user_settings) by user_id.
        if (!shouldAcceptSignalForScope(ctx, signal, change.scope)) {
          continue;
        }
        for (const queryKey of binding.resolveQueryKeys(ctx, signal)) {
          const serialized = JSON.stringify(queryKey);
          if (keys.has(serialized)) {
            continue;
          }
          keys.add(serialized);
          invalidate(queryKey);
        }
      }
    },
  };
}

export function mergePostgresChangesWithTenantFilter(
  bindings: LiveCacheBinding[],
  tenantId: string
): PostgresChangeSpec[] {
  return mergePostgresChangesWithScopeFilters(bindings, { tenantId });
}

/**
 * Build the realtime subscription's change specs, attaching the right server
 * filter per scope: `tenant_id=eq.{tenantId}` for tenant rows and
 * `user_id=eq.{userId}` for user-scoped rows. An explicit `filter` on a spec
 * always wins. User-scoped specs are dropped when no `userId` is in context.
 */
export function mergePostgresChangesWithScopeFilters(
  bindings: LiveCacheBinding[],
  ctx: Pick<LiveCacheContext, "tenantId" | "userId">
): PostgresChangeSpec[] {
  const merged = new Map<string, PostgresChangeSpec>();

  for (const binding of bindings) {
    for (const change of binding.postgresChanges ?? []) {
      const scope = change.scope ?? "tenant";
      const defaultFilter =
        scope === "user"
          ? ctx.userId
            ? `user_id=eq.${ctx.userId}`
            : undefined
          : `tenant_id=eq.${ctx.tenantId}`;

      // No filter resolvable for a user-scoped spec without a userId: skip it
      // rather than subscribe tenant-wide to per-user rows.
      if (scope === "user" && !change.filter && !defaultFilter) {
        continue;
      }

      const key = `${change.schema}.${change.table}`;
      merged.set(key, {
        ...change,
        filter: change.filter ?? defaultFilter,
      });
    }
  }

  return [...merged.values()];
}
