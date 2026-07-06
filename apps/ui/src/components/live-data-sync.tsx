import { type LiveCacheBinding, useLiveCache } from "@engenty/live-cache";
import { useMemo } from "react";

/**
 * One app-wide Supabase Realtime subscription that keeps every module's React
 * Query cache fresh when its rows change — regardless of writer (the copilot
 * agent, another tab, another user, a background job). The reactive counterpart
 * to the agent-write fast path (`agentToolInvalidation`); together they give
 * Convex-like "data changed → UI updates" without per-page wiring. Renders
 * nothing. Mounted once in the authenticated shell, where the tenant is known.
 */
export function LiveDataSync({
  bindings,
  tenantId,
  userId,
}: {
  bindings: LiveCacheBinding[];
  tenantId: string;
  userId: string;
}) {
  // Stable ctx identity: an inline object would re-run the subscribe effect on
  // every shell render, tearing the channel down and missing events in between.
  const ctx = useMemo(() => ({ tenantId, userId }), [tenantId, userId]);
  useLiveCache({
    bindings,
    channelName: `live-data:${tenantId}`,
    ctx,
    enabled: Boolean(tenantId),
  });
  return null;
}
