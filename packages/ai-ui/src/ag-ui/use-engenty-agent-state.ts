/**
 * Colocated shared state (Enhancing Copilot Ch.6) — the reactive read/write sibling
 * of `useEngentyAgentContext`. Mirrors CopilotKit's `useAgent().state` + `setState`:
 *
 *   const [plan, setPlan] = useEngentyAgentState<{ steps: string[] }>("plan");
 *
 * Read: the current `shared[key]` from the agent host state (reflects both the app's
 * round-tripped writes and the agent's `set_state` STATE_DELTAs). Write: persists the
 * value as an app slice that flows into the next run's state.
 *
 * **Per-key ownership (v1).** `setState` makes the key app-owned: the app's value is
 * shown and re-asserted on each UI-state snapshot. Keys the app never sets are
 * agent-owned (driven by the agent's `set_state`). For a key both sides write, the
 * app's value wins — use distinct keys per owner for predictable behavior.
 */
import type { JsonValue } from "@engenty/ag-ui-bridge";
import { useRegisterAgentUiSlice } from "@engenty/app-shell";
import { useCallback, useState } from "react";
import { useOptionalAgentHostByKey } from "../agent-provider/engenty-agent.js";

/** Read `state.shared[key]` defensively from the agent host state. */
export function readSharedValue(
  state: unknown,
  key: string
): JsonValue | undefined {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return;
  }
  const shared = (state as { shared?: unknown }).shared;
  if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
    return;
  }
  return (shared as Record<string, JsonValue>)[key];
}

export function useEngentyAgentState<T extends JsonValue = JsonValue>(
  key: string,
  hostKey?: string
): [T | undefined, (value: T) => void] {
  const host = useOptionalAgentHostByKey(hostKey);
  const agentValue = readSharedValue(host?.state, key) as T | undefined;

  // The app's own contribution: persisted as a slice so it round-trips app→agent.
  // Optimistically shown immediately (before the round-trip lands).
  const [appValue, setAppValue] = useState<T | undefined>(undefined);
  useRegisterAgentUiSlice(
    `agent-state:${key}`,
    appValue === undefined ? null : { shared: { [key]: appValue } }
  );

  const setState = useCallback((value: T) => setAppValue(value), []);

  return [appValue ?? agentValue, setState];
}
