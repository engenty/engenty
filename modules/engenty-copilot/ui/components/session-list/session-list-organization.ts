import type {
  AgentSessionDto,
  AgentSessionStatus,
} from "../../../src/lib/agent-session-types.js";

export type SessionListArchivedFilter = "active" | "archived" | "all";
export type SessionListAgeFilter =
  | "all"
  | "today"
  | "last-two-days"
  | "last-seven-days"
  | "last-thirty-days";
export type SessionListGroupBy = "none" | "date" | "status" | "agent" | "type";
export type SessionListSortBy = "updated_at" | "created_at" | "title" | "agent";

export interface SessionListOrganizationPrefs {
  age: SessionListAgeFilter;
  agentId: string | null;
  archived: SessionListArchivedFilter;
  groupBy: SessionListGroupBy;
  sortBy: SessionListSortBy;
  sortOrder: "asc" | "desc";
  status: AgentSessionStatus | "all";
}

export interface SessionListGroup {
  id: string;
  label: string;
  sessions: AgentSessionDto[];
}

export interface SessionListOrganizationLabels {
  activeChats: string;
  archivedChats: string;
  dateOlder: string;
  datePreviousSevenDays: string;
  dateToday: string;
  dateYesterday: string;
  status: Record<AgentSessionStatus, string>;
  typeFallback: string;
}

export const DEFAULT_SESSION_LIST_PREFS: SessionListOrganizationPrefs = {
  agentId: null,
  age: "all",
  archived: "active",
  groupBy: "none",
  sortBy: "updated_at",
  sortOrder: "desc",
  status: "all",
};

export function organizeSessionList(params: {
  agentLabel: (agentId: string) => string;
  labels: SessionListOrganizationLabels;
  now?: Date;
  prefs: SessionListOrganizationPrefs;
  sessions: readonly AgentSessionDto[];
}): SessionListGroup[] {
  const sessions = params.sessions
    .filter((session) => matchesFilters(session, params))
    .toSorted((a, b) => compareSessions(a, b, params));

  if (params.prefs.groupBy === "none") {
    return [{ id: "all", label: "", sessions }];
  }

  const groups = new Map<string, SessionListGroup>();
  for (const session of sessions) {
    const group = resolveGroup(session, params);
    const existing = groups.get(group.id);
    if (existing) {
      existing.sessions.push(session);
    } else {
      groups.set(group.id, { ...group, sessions: [session] });
    }
  }
  const list = [...groups.values()];
  if (params.prefs.groupBy === "date") {
    return list;
  }
  return list.toSorted((a, b) => compareText(a.label, b.label));
}

function matchesFilters(
  session: AgentSessionDto,
  params: {
    labels: SessionListOrganizationLabels;
    now?: Date;
    prefs: SessionListOrganizationPrefs;
  }
): boolean {
  const { prefs } = params;
  if (prefs.agentId && session.agent_id !== prefs.agentId) {
    return false;
  }
  if (prefs.status !== "all" && session.status !== prefs.status) {
    return false;
  }
  if (prefs.archived === "active" && session.archived_at !== null) {
    return false;
  }
  if (prefs.archived === "archived" && session.archived_at === null) {
    return false;
  }
  if (
    prefs.age !== "all" &&
    !matchesAgeFilter(session.updated_at, prefs.age, params.now)
  ) {
    return false;
  }
  return true;
}

function compareSessions(
  a: AgentSessionDto,
  b: AgentSessionDto,
  params: {
    agentLabel: (agentId: string) => string;
    prefs: SessionListOrganizationPrefs;
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
  session: AgentSessionDto,
  params: {
    agentLabel: (agentId: string) => string;
    labels: SessionListOrganizationLabels;
    now?: Date;
    prefs: SessionListOrganizationPrefs;
  }
): Omit<SessionListGroup, "sessions"> {
  if (params.prefs.groupBy === "agent") {
    return {
      id: `agent:${session.agent_id}`,
      label: params.agentLabel(session.agent_id),
    };
  }
  if (params.prefs.groupBy === "status") {
    return {
      id: `status:${session.status}`,
      label: params.labels.status[session.status],
    };
  }
  if (params.prefs.groupBy === "type") {
    const type = resolveSessionType(session, params.labels);
    return {
      id: `type:${type.key}`,
      label: type.label,
    };
  }
  const dateGroup = resolveDateGroup(
    session.updated_at,
    params.labels,
    params.now
  );
  return { id: `date:${dateGroup.key}`, label: dateGroup.label };
}

export function resolveSessionType(
  session: Pick<AgentSessionDto, "route_context" | "workspace_key">,
  labels: Pick<SessionListOrganizationLabels, "typeFallback">
): { key: string; label: string } {
  const routeKey = stringValue(
    session.route_context.route_key ?? session.route_context.routeKey
  );
  if (routeKey) {
    return { key: routeKey, label: formatTypeLabel(routeKey) };
  }
  const workspaceKey = stringValue(session.workspace_key);
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
  labels: SessionListOrganizationLabels,
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
  age: Exclude<SessionListAgeFilter, "all">,
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
