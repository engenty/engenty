// Pure map/filter/grouping logic for the activity feed (ui-6 §5).
// The feed lists sessions (threads) — the operator-browsable unit. Runs are an
// internal execution substrate and are not surfaced here.

import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-types.js";

export type ActivityStatusFilter = "all" | "running" | "failed" | "finished";
export type ActivityStatusKind = "running" | "failed" | "finished" | "other";

export interface ActivityEntry {
  agentId: string | null;
  /** Thread id (the navigable entity). */
  entityId: string;
  /** UI host the thread is bound to (route_context host_key/module), if any. */
  hostKey: string | null;
  /** Unique list key. */
  key: string;
  status: string;
  statusKind: ActivityStatusKind;
  timestamp: string;
  title: string | null;
  /** Owner of the thread. */
  userId: string;
}

export interface ActivityFilterState {
  agentId: string | null;
  search: string;
  status: ActivityStatusFilter;
}

function threadStatusKind(
  status: AiAdminThreadRow["status"]
): ActivityStatusKind {
  switch (status) {
    case "running":
    case "waiting":
      return "running";
    case "failed":
      return "failed";
    case "completed":
      return "finished";
    default:
      return "other";
  }
}

/** Best-available binding signal from route_context (host, module, or key). */
function threadHostKey(
  routeContext: Record<string, unknown> | null | undefined
): string | null {
  for (const field of ["host_key", "moduleId", "session_key"]) {
    const value = routeContext?.[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function toActivityEntries(input: {
  sessions: AiAdminThreadRow[];
}): ActivityEntry[] {
  return input.sessions
    .map((thread) => ({
      agentId: thread.current_agent_id,
      entityId: thread.id,
      hostKey: threadHostKey(thread.route_context),
      key: `thread:${thread.id}`,
      status: thread.status,
      statusKind: threadStatusKind(thread.status),
      timestamp: thread.last_message_at ?? thread.updated_at,
      title: thread.title?.trim() || thread.summary?.trim() || null,
      userId: thread.user_id,
    }))
    .toSorted(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
    );
}

export function filterActivityEntries(
  entries: ActivityEntry[],
  filters: ActivityFilterState
): ActivityEntry[] {
  const query = filters.search.trim().toLowerCase();
  return entries.filter((entry) => {
    if (filters.agentId && entry.agentId !== filters.agentId) {
      return false;
    }
    if (filters.status !== "all" && entry.statusKind !== filters.status) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      (entry.title?.toLowerCase().includes(query) ?? false) ||
      entry.entityId.toLowerCase().includes(query)
    );
  });
}

/** Live-poll predicate: poll only while a running entry is present. */
export function hasRunningActivityEntry(entries: ActivityEntry[]): boolean {
  return entries.some((entry) => entry.statusKind === "running");
}
