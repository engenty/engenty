import type { HookStateStore } from "./types.js";

/**
 * The run-scoped hook-state store (D3): an in-memory overlay over the render
 * snapshot for read-your-writes, with write-through persistence via the
 * provided `persist` callback. Deep-equal no-op writes are dropped, so "one
 * actual change → one persistence call" holds no matter how often a setter
 * runs.
 *
 * Deviation from Flue noted in the plan: Flue drains a buffer atomically with
 * its tool batch; our tools take effect immediately (real side effects, no
 * batch rollback), so hook state persists write-through to match — a state
 * transition is durable the moment the transition tool returns, which is what
 * park/resume needs.
 */
export function createHookStateStore(options: {
  snapshot: ReadonlyMap<string, unknown>;
  persist: (state: Record<string, unknown>) => Promise<void>;
}): HookStateStore {
  const overlay = new Map<string, unknown>();
  const currentValue = (key: string): { value: unknown } | undefined => {
    if (overlay.has(key)) {
      return { value: overlay.get(key) };
    }
    if (options.snapshot.has(key)) {
      return { value: options.snapshot.get(key) };
    }
    return;
  };
  return {
    current: currentValue,
    async write(key, value) {
      const current = currentValue(key);
      if (current && JSON.stringify(current.value) === JSON.stringify(value)) {
        return;
      }
      overlay.set(key, value);
      // Persist the full reduced state (snapshot + overlay) — the storage
      // shape is one JSON object under metadata.agent_state.
      const merged: Record<string, unknown> = {};
      for (const [k, v] of options.snapshot) {
        merged[k] = v;
      }
      for (const [k, v] of overlay) {
        merged[k] = v;
      }
      await options.persist(merged);
    },
  };
}
