import { type LiveCacheBinding, useLiveCache } from "@engenty/live-cache";

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
  useLiveCache({
    bindings,
    channelName: `live-data:${tenantId}`,
    ctx: { tenantId, userId },
    enabled: Boolean(tenantId),
  });
  return null;
}
