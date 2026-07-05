import { getOptionalSupabaseAuthClient } from "@engenty/auth-ui";
import { useQueryClient } from "@engenty/query-client";
import { useEffect, useMemo } from "react";
import { createDebouncedInvalidator } from "./debounced-invalidate.js";
import {
  createLiveCacheRegistry,
  mergePostgresChangesWithScopeFilters,
} from "./live-cache-registry.js";
import { subscribePostgresChanges } from "./postgres-change-subscription.js";
import type { LiveCacheBinding, LiveCacheContext } from "./types.js";
import { useSupabaseClaimsInSync } from "./use-supabase-claims-in-sync.js";

function resolveBlockedReason(state: {
  changeCount: number;
  claimsSync: { inSync: boolean; ready: boolean };
  enabled: boolean;
  tenantId: string | null | undefined;
}): string | null {
  if (!state.enabled) {
    return "disabled";
  }
  if (!state.tenantId) {
    return "no tenant id";
  }
  if (!state.claimsSync.ready) {
    // Claims check still pending — not a terminal state, don't warn.
    return null;
  }
  if (!state.claimsSync.inSync) {
    return "supabase token claims do not match the workspace tenant";
  }
  if (state.changeCount === 0) {
    return "no postgres change bindings registered";
  }
  return null;
}

export function useLiveCache(params: {
  bindings: LiveCacheBinding[];
  channelName: string;
  ctx: LiveCacheContext;
  debounceMs?: number;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const claimsSync = useSupabaseClaimsInSync(params.ctx.tenantId);
  const invalidate = useMemo(
    () => createDebouncedInvalidator(queryClient, params.debounceMs),
    [params.debounceMs, queryClient]
  );
  const registry = useMemo(
    () => createLiveCacheRegistry(params.bindings),
    [params.bindings]
  );
  const postgresChanges = useMemo(
    () =>
      mergePostgresChangesWithScopeFilters(params.bindings, {
        tenantId: params.ctx.tenantId,
        userId: params.ctx.userId,
      }),
    [params.bindings, params.ctx.tenantId, params.ctx.userId]
  );
  const subscribeEnabled =
    params.enabled &&
    Boolean(params.ctx.tenantId) &&
    claimsSync.ready &&
    claimsSync.inSync;

  // Realtime failing silently is undebuggable — always say why we are not
  // subscribing (except while the claims check is still pending).
  const blockedReason = resolveBlockedReason({
    enabled: params.enabled,
    tenantId: params.ctx.tenantId,
    claimsSync,
    changeCount: postgresChanges.length,
  });
  useEffect(() => {
    if (blockedReason) {
      console.warn(`[live-cache] not subscribing: ${blockedReason}`);
    }
  }, [blockedReason]);

  useEffect(() => {
    if (!(subscribeEnabled && params.ctx.tenantId)) {
      return;
    }

    let cancelled = false;

    async function subscribeWhenSessionReady() {
      const client = getOptionalSupabaseAuthClient();
      if (!client) {
        console.warn(
          "[live-cache] not subscribing: no supabase client (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)"
        );
        return;
      }

      const { data } = await client.auth.getSession();
      if (!data.session?.access_token || cancelled) {
        if (!cancelled) {
          console.warn("[live-cache] not subscribing: no supabase session");
        }
        return;
      }
      console.info(
        `[live-cache] subscribing ${postgresChanges.length} table(s) on "${params.channelName}"`
      );

      const unsubscribe = subscribePostgresChanges({
        channelName: params.channelName,
        changes: postgresChanges,
        client: client as never,
        onSignal: (signal) => {
          registry.handleSignal(queryClient, params.ctx, signal, invalidate);
        },
      });

      if (cancelled) {
        unsubscribe();
        return;
      }

      return unsubscribe;
    }

    let unsubscribe: (() => void) | undefined;
    void subscribeWhenSessionReady().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [
    invalidate,
    params.channelName,
    params.ctx,
    postgresChanges,
    queryClient,
    registry,
    subscribeEnabled,
  ]);
}
