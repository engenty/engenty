import type { LiveCacheBinding, PostgresChangeSpec } from "./types.js";

/**
 * One module's reactive-data declaration: how out-of-band writes (the copilot
 * agent's tools, other tabs, background jobs) map back to the React Query roots
 * the UI reads. A single source of truth consumed by two layers:
 *
 * - **Agent-write invalidation** (`agentToolIds`) — when a copilot tool call
 *   resolves on the client, invalidate this module's `queryRoot` immediately,
 *   even before realtime lands. See `buildAgentToolInvalidationMap`.
 * - **Realtime invalidation** (`postgresChanges`) — a global Supabase Realtime
 *   subscription invalidates this module's `queryRoot` on any matching row
 *   change, covering every writer. See `toLiveCacheBindings`.
 */
export interface ModuleLiveBinding {
  /** LLM-facing agent tool ids whose execution mutates this module's data. */
  agentToolIds?: readonly string[];
  /** Stable module id (e.g. "projects"). */
  id: string;
  /** Postgres tables whose changes invalidate this module (realtime layer). */
  postgresChanges?: PostgresChangeSpec[];
  /** React Query root key whose subtree should refetch (e.g. ["projects"]). */
  queryRoot: readonly unknown[];
}

/** Tool id (as seen in `TOOL_CALL_START.toolCallName`) → query roots to invalidate. */
export function buildAgentToolInvalidationMap(
  bindings: readonly ModuleLiveBinding[]
): Map<string, readonly (readonly unknown[])[]> {
  const map = new Map<string, (readonly unknown[])[]>();
  for (const binding of bindings) {
    for (const toolId of binding.agentToolIds ?? []) {
      const roots = map.get(toolId) ?? [];
      roots.push(binding.queryRoot);
      map.set(toolId, roots);
    }
  }
  return map;
}

/** Convert module bindings to `LiveCacheBinding[]` for the global realtime mount. */
export function toLiveCacheBindings(
  bindings: readonly ModuleLiveBinding[]
): LiveCacheBinding[] {
  return bindings
    .filter((binding) => (binding.postgresChanges?.length ?? 0) > 0)
    .map((binding) => ({
      id: binding.id,
      postgresChanges: binding.postgresChanges,
      resolveQueryKeys: () => [binding.queryRoot],
    }));
}
