"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The names the app has actually loaded for agent ids.
 *
 * Transcript rows, the sub-agent cards and the thread-context box are handed
 * an agent ID by the run, never a name — so they used to title-case the id,
 * which is how a delegation to `inbox.overview` read as "Inbox.Overview", and
 * why the real name only appeared once something else on the page happened to
 * render it. Surfaces that load the agent catalog publish into this registry;
 * readers fall back to the humanised id until one does.
 *
 * Keyed on a normalised id because the same agent arrives spelled two ways:
 * the registry uses dots (`inbox.overview`), while a delegation tool name
 * carries underscores (`agent-inbox_overview`).
 */
const displayNames = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;

function normalizeAgentId(agentId: string): string {
  return agentId
    .trim()
    .toLowerCase()
    .replaceAll(/[.\-_]+/gu, "_");
}

function emit() {
  version += 1;
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Publish `id → name` pairs. Ignores blanks so a half-loaded catalog cannot
 * overwrite a good name with an id.
 */
export function registerAgentDisplayNames(
  entries: Iterable<readonly [string, string]>
) {
  let changed = false;
  for (const [agentId, name] of entries) {
    const key = normalizeAgentId(agentId);
    const label = name.trim();
    if (
      !(key && label) ||
      label === agentId ||
      displayNames.get(key) === label
    ) {
      continue;
    }
    displayNames.set(key, label);
    changed = true;
  }
  if (changed) {
    emit();
  }
}

export function readAgentDisplayName(agentId: string): string | undefined {
  return displayNames.get(normalizeAgentId(agentId));
}

export function clearAgentDisplayNamesForTests() {
  displayNames.clear();
  emit();
}

/**
 * Re-render when a name arrives. Components that resolve a name while
 * rendering subscribe to this so a late catalog load replaces the id in place
 * instead of leaving it until the next unrelated render.
 */
export function useAgentDisplayNamesVersion(): number {
  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
      listeners.delete(onStoreChange);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0
  );
}
