import type { JsonPatchOperation, JsonValue } from "./json-value.js";
import { isRecord } from "./json-value.js";

export interface AgentUiRouteSnapshot {
  module_id: string;
  pathname: string;
  route_key: string;
}

export interface AgentUiShellSnapshot {
  active_dialog?: string | null;
  copilot_open: boolean;
  dock_mode?: string | null;
}

export interface AgentUiSelectionSnapshot {
  entity_id?: string;
  entity_type?: string;
  focused_field?: string | null;
  selected_ids?: string[];
}

export interface AgentUiDraftSnapshot {
  dirty: boolean;
  fields?: Record<string, JsonValue>;
}

/**
 * A described, read-only context slice the app contributes for the agent to
 * reason about ("what the user is looking at"). The read-only sibling of state:
 * `description` is natural language, `value` is the data. Rendered into the
 * harness instructions as `- {description}: {value}`.
 */
export interface AgentUiAppContextEntry {
  description: string;
  value: JsonValue;
}

export interface AgentUiStateSnapshotV1 {
  /** Described, read-only context slices (Enhancing Copilot Ch.7). */
  app_context?: AgentUiAppContextEntry[];
  draft?: AgentUiDraftSnapshot;
  observed_at: string;
  page?: Record<string, JsonValue>;
  permissions?: {
    frontend_tools: Record<string, { available: boolean }>;
  };
  route: AgentUiRouteSnapshot;
  selection?: AgentUiSelectionSnapshot;
  sequence: number;
  /**
   * Bidirectional reactive shared state (Enhancing Copilot Ch.6), keyed by name.
   * Written by both the app (`useEngentyAgentState` → slice) and the agent
   * (`set_state` → STATE_DELTA). Merged last-writer-wins per key; the reducer
   * merges (not replaces) this field on STATE_SNAPSHOT to avoid state loss.
   */
  shared?: Record<string, JsonValue>;
  shell: AgentUiShellSnapshot;
  snapshot_id: string;
  version: 1;
}

export type { JsonPatchOperation } from "./json-value.js";

export interface AgentUiStateDeltaV1 {
  base_sequence: number;
  delta_id: string;
  next_sequence: number;
  operations: JsonPatchOperation[];
  snapshot_id: string;
  version: 1;
}

export const AGENT_UI_STATE_SNAPSHOT_MAX_BYTES = 32 * 1024;

/** Stable key for navigation/shell/selection changes (used to bump AG-UI sequence). */
export function agentUiBaseShellSignature(base: {
  route: AgentUiRouteSnapshot;
  selection?: AgentUiSelectionSnapshot;
  shell: AgentUiShellSnapshot;
}): string {
  return JSON.stringify({
    pathname: base.route.pathname,
    module_id: base.route.module_id,
    route_key: base.route.route_key,
    entity_id: base.selection?.entity_id ?? null,
    entity_type: base.selection?.entity_type ?? null,
    copilot_open: base.shell.copilot_open,
    dock_mode: base.shell.dock_mode ?? null,
  });
}

/** Includes `sequence` so consumers detect any published snapshot revision. */
export function agentUiSharedStateSignature(
  snapshot: Pick<
    AgentUiStateSnapshotV1,
    "route" | "selection" | "shell" | "sequence"
  >
): string {
  return JSON.stringify({
    sequence: snapshot.sequence,
    pathname: snapshot.route.pathname,
    module_id: snapshot.route.module_id,
    route_key: snapshot.route.route_key,
    entity_id: snapshot.selection?.entity_id ?? null,
    entity_type: snapshot.selection?.entity_type ?? null,
    copilot_open: snapshot.shell.copilot_open,
    dock_mode: snapshot.shell.dock_mode ?? null,
  });
}

export function getAgentUiStateSnapshotByteLength(
  snapshot: AgentUiStateSnapshotV1
): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

export function assertAgentUiStateSnapshotWithinLimit(
  snapshot: AgentUiStateSnapshotV1,
  maxBytes = AGENT_UI_STATE_SNAPSHOT_MAX_BYTES
): void {
  const bytes = getAgentUiStateSnapshotByteLength(snapshot);
  if (bytes > maxBytes) {
    throw new Error(
      `Agent UI state snapshot is too large (${bytes} bytes, max ${maxBytes}).`
    );
  }
}

export function isAgentUiStateSnapshotV1(
  value: unknown
): value is AgentUiStateSnapshotV1 {
  if (!isRecord(value) || value.version !== 1) {
    return false;
  }
  return (
    typeof value.snapshot_id === "string" &&
    typeof value.sequence === "number" &&
    typeof value.observed_at === "string" &&
    isRecord(value.route) &&
    typeof value.route.module_id === "string" &&
    typeof value.route.pathname === "string" &&
    typeof value.route.route_key === "string" &&
    isRecord(value.shell) &&
    typeof value.shell.copilot_open === "boolean" &&
    getAgentUiStateSnapshotByteLength(
      value as unknown as AgentUiStateSnapshotV1
    ) <= AGENT_UI_STATE_SNAPSHOT_MAX_BYTES
  );
}

/**
 * Where the UI state snapshot rides on the wire: `forwardedProps.engenty.ui_state`.
 *
 * NEVER `RunAgentInput.state`. AG-UI's `state` is the agent's SHARED, DURABLE
 * state, and `@ag-ui/mastra` merges it into Mastra working memory before every
 * run, unconditionally and with no opt-out (`syncInputStateToWorkingMemory`).
 * This snapshot is the opposite: which route the user is on, what row is
 * selected, whether the copilot is open — true for one instant. Putting it on
 * `state` writes it into the agent's long-term memory on every turn and
 * corrupts it.
 *
 * `forwardedProps` is the protocol's slot for per-run data the agent implementation
 * interprets — which is exactly what this is — and we already namespace `effort` and
 * `model_id` under `engenty` there.
 */
export function readAgentUiStateSnapshot(
  forwardedProps: unknown
): AgentUiStateSnapshotV1 | undefined {
  if (!(isRecord(forwardedProps) && isRecord(forwardedProps.engenty))) {
    return;
  }
  const candidate = forwardedProps.engenty.ui_state;
  return isAgentUiStateSnapshotV1(candidate) ? candidate : undefined;
}

/** Namespaced carrier for the snapshot, to spread into `forwardedProps.engenty`. */
export function agentUiStateForwardedProps(
  snapshot: AgentUiStateSnapshotV1 | undefined
): { ui_state?: AgentUiStateSnapshotV1 } {
  return snapshot ? { ui_state: snapshot } : {};
}
