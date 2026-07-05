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
  // One change-set PER BINDING, subscribed on its own realtime channel.
  // Realtime creates all of a channel's postgres_changes subscriptions in a
  // single transaction — one binding referencing a table missing from the
  // `supabase_realtime` publication would otherwise roll back EVERY module's
  // subscription on a shared channel. Per-binding channels contain the blast
  // radius to the broken module.
  const bindingChangeSets = useMemo(
    () =>
      params.bindings
        .map((binding) => ({
          id: binding.id,
          changes: mergePostgresChangesWithScopeFilters([binding], {
            tenantId: params.ctx.tenantId,
            userId: params.ctx.userId,
          }),
        }))
        .filter((entry) => entry.changes.length > 0),
    [params.bindings, params.ctx.tenantId, params.ctx.userId]
  );
  const changeCount = bindingChangeSets.reduce(
    (sum, entry) => sum + entry.changes.length,
    0
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
    changeCount,
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
        `[live-cache] subscribing ${changeCount} table(s) across ${bindingChangeSets.length} channel(s) on "${params.channelName}:*"`
      );

      const unsubscribers = bindingChangeSets.map((entry) =>
        subscribePostgresChanges({
          channelName: `${params.channelName}:${entry.id}`,
          changes: entry.changes,
          client: client as never,
          onSignal: (signal) => {
            registry.handleSignal(queryClient, params.ctx, signal, invalidate);
          },
        })
      );
      const unsubscribe = () => {
        for (const entry of unsubscribers) {
          entry();
        }
      };

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
    bindingChangeSets,
    changeCount,
    queryClient,
    registry,
    subscribeEnabled,
  ]);
}
