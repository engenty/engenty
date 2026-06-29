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

  useEffect(() => {
    if (!(subscribeEnabled && params.ctx.tenantId)) {
      return;
    }

    let cancelled = false;

    async function subscribeWhenSessionReady() {
      const client = getOptionalSupabaseAuthClient();
      if (!client) {
        return;
      }

      const { data } = await client.auth.getSession();
      if (!data.session?.access_token || cancelled) {
        return;
      }

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
