// Pure map/filter/grouping logic for the activity feed (ui-6 §5).
// The feed lists sessions (threads) — the operator-browsable unit. Runs are an
// internal execution substrate and are not surfaced here.

import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-types";

export type ActivityStatusFilter = "all" | "running" | "failed" | "finished";
export type ActivityStatusKind = "running" | "failed" | "finished" | "other";

export interface ActivityEntry {
  agentId: string | null;
  /** Thread id (the navigable entity). */
  entityId: string;
  /** Unique list key. */
  key: string;
  status: string;
  statusKind: ActivityStatusKind;
  timestamp: string;
  title: string | null;
}

export interface ActivityFilterState {
  agentId: string | null;
  search: string;
  status: ActivityStatusFilter;
}

function sessionStatusKind(
  status: AiAdminSessionRow["status"]
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

export function toActivityEntries(input: {
  sessions: AiAdminSessionRow[];
}): ActivityEntry[] {
  return input.sessions
    .map((session) => ({
      agentId: session.current_agent_id,
      entityId: session.id,
      key: `session:${session.id}`,
      status: session.status,
      statusKind: sessionStatusKind(session.status),
      timestamp: session.last_message_at ?? session.updated_at,
      title: session.title?.trim() || session.summary?.trim() || null,
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
