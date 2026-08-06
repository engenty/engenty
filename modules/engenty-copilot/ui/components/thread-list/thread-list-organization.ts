import type {
  AgentThreadDto,
  AgentThreadStatus,
} from "../../../src/lib/agent-thread-types.js";

export type ThreadListArchivedFilter = "active" | "archived" | "all";
export type ThreadListAgeFilter =
  | "all"
  | "today"
  | "last-two-days"
  | "last-seven-days"
  | "last-thirty-days";
export type ThreadListGroupBy = "none" | "date" | "status" | "agent" | "type";
export type ThreadListSortBy = "updated_at" | "created_at" | "title" | "agent";

export interface ThreadListOrganizationPrefs {
  age: ThreadListAgeFilter;
  agentId: string | null;
  archived: ThreadListArchivedFilter;
  groupBy: ThreadListGroupBy;
  sortBy: ThreadListSortBy;
  sortOrder: "asc" | "desc";
  status: AgentThreadStatus | "all";
}

export interface ThreadListGroup {
  id: string;
  label: string;
  threads: AgentThreadDto[];
}

export interface ThreadListOrganizationLabels {
  activeChats: string;
  archivedChats: string;
  dateOlder: string;
  datePreviousSevenDays: string;
  dateToday: string;
  dateYesterday: string;
  status: Record<AgentThreadStatus, string>;
  typeFallback: string;
}

export const DEFAULT_THREAD_LIST_PREFS: ThreadListOrganizationPrefs = {
  agentId: null,
  age: "all",
  archived: "active",
  groupBy: "none",
  sortBy: "updated_at",
  sortOrder: "desc",
  status: "all",
};

export function organizeThreadList(params: {
  agentLabel: (agentId: string) => string;
  labels: ThreadListOrganizationLabels;
  now?: Date;
  prefs: ThreadListOrganizationPrefs;
  threads: readonly AgentThreadDto[];
}): ThreadListGroup[] {
  const threads = params.threads
    .filter((thread) => matchesFilters(thread, params))
    .toSorted((a, b) => compareThreads(a, b, params));

  if (params.prefs.groupBy === "none") {
    return [{ id: "all", label: "", threads }];
  }

  const groups = new Map<string, ThreadListGroup>();
  for (const thread of threads) {
    const group = resolveGroup(thread, params);
    const existing = groups.get(group.id);
    if (existing) {
      existing.threads.push(thread);
    } else {
      groups.set(group.id, { ...group, threads: [thread] });
    }
  }
  const list = [...groups.values()];
  if (params.prefs.groupBy === "date") {
    return list;
  }
  return list.toSorted((a, b) => compareText(a.label, b.label));
}

function matchesFilters(
  thread: AgentThreadDto,
  params: {
    labels: ThreadListOrganizationLabels;
    now?: Date;
    prefs: ThreadListOrganizationPrefs;
  }
): boolean {
  const { prefs } = params;
  if (prefs.agentId && thread.agent_id !== prefs.agentId) {
    return false;
  }
  if (prefs.status !== "all" && thread.status !== prefs.status) {
    return false;
  }
  if (prefs.archived === "active" && thread.archived_at !== null) {
    return false;
  }
  if (prefs.archived === "archived" && thread.archived_at === null) {
    return false;
  }
  if (
    prefs.age !== "all" &&
    !matchesAgeFilter(thread.updated_at, prefs.age, params.now)
  ) {
    return false;
  }
  return true;
}

function compareThreads(
  a: AgentThreadDto,
  b: AgentThreadDto,
  params: {
    agentLabel: (agentId: string) => string;
    prefs: ThreadListOrganizationPrefs;
  }
): number {
  const direction = params.prefs.sortOrder === "asc" ? 1 : -1;
  let result = 0;
  if (params.prefs.sortBy === "title") {
    result = compareText(a.title ?? "", b.title ?? "");
  } else if (params.prefs.sortBy === "agent") {
    result = compareText(
      params.agentLabel(a.agent_id),
      params.agentLabel(b.agent_id)
    );
  } else {
    result = compareText(a[params.prefs.sortBy], b[params.prefs.sortBy]);
  }
  return result === 0 ? compareText(a.id, b.id) : result * direction;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function resolveGroup(
  thread: AgentThreadDto,
  params: {
    agentLabel: (agentId: string) => string;
    labels: ThreadListOrganizationLabels;
    now?: Date;
    prefs: ThreadListOrganizationPrefs;
  }
): Omit<ThreadListGroup, "threads"> {
  if (params.prefs.groupBy === "agent") {
    return {
      id: `agent:${thread.agent_id}`,
      label: params.agentLabel(thread.agent_id),
    };
  }
  if (params.prefs.groupBy === "status") {
    return {
      id: `status:${thread.status}`,
      label: params.labels.status[thread.status],
    };
  }
  if (params.prefs.groupBy === "type") {
    const type = resolveThreadType(thread, params.labels);
    return {
      id: `type:${type.key}`,
      label: type.label,
    };
  }
  const dateGroup = resolveDateGroup(
    thread.updated_at,
    params.labels,
    params.now
  );
  return { id: `date:${dateGroup.key}`, label: dateGroup.label };
}

export function resolveThreadType(
  thread: Pick<AgentThreadDto, "route_context" | "workspace_key">,
  labels: Pick<ThreadListOrganizationLabels, "typeFallback">
): { key: string; label: string } {
  const routeKey = stringValue(
    thread.route_context.route_key ?? thread.route_context.routeKey
  );
  if (routeKey) {
    return { key: routeKey, label: formatTypeLabel(routeKey) };
  }
  const workspaceKey = stringValue(thread.workspace_key);
  if (workspaceKey) {
    return { key: workspaceKey, label: formatTypeLabel(workspaceKey) };
  }
  return { key: "chat", label: labels.typeFallback };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function formatTypeLabel(value: string): string {
  return value
    .replace(/[_./:-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveDateGroup(
  updatedAt: string,
  labels: ThreadListOrganizationLabels,
  now = new Date()
): { key: string; label: string } {
  const updated = new Date(updatedAt);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfPreviousSevenDays = new Date(startOfToday);
  startOfPreviousSevenDays.setDate(startOfPreviousSevenDays.getDate() - 7);

  if (updated >= startOfToday) {
    return { key: "today", label: labels.dateToday };
  }
  if (updated >= startOfYesterday) {
    return { key: "yesterday", label: labels.dateYesterday };
  }
  if (updated >= startOfPreviousSevenDays) {
    return {
      key: "previous-seven-days",
      label: labels.datePreviousSevenDays,
    };
  }
  return { key: "older", label: labels.dateOlder };
}

function matchesAgeFilter(
  updatedAt: string,
  age: Exclude<ThreadListAgeFilter, "all">,
  now = new Date()
): boolean {
  const updated = new Date(updatedAt);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (age === "today") {
    return updated >= start;
  }
  if (age === "last-two-days") {
    start.setDate(start.getDate() - 1);
    return updated >= start;
  }
  if (age === "last-seven-days") {
    start.setDate(start.getDate() - 7);
    return updated >= start;
  }
  start.setDate(start.getDate() - 30);
  return updated >= start;
}
