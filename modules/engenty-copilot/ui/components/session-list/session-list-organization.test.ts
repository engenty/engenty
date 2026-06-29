import { describe, expect, it } from "vitest";
import type { AgentSessionDto } from "../../../src/lib/agent-session-types.js";
import {
  DEFAULT_SESSION_LIST_PREFS,
  organizeSessionList,
  type SessionListOrganizationLabels,
} from "./session-list-organization.js";

const labels: SessionListOrganizationLabels = {
  activeChats: "Active",
  archivedChats: "Archived",
  dateOlder: "Older",
  datePreviousSevenDays: "Previous 7 days",
  dateToday: "Today",
  dateYesterday: "Yesterday",
  status: {
    completed: "Completed",
    failed: "Failed",
    idle: "Idle",
    running: "Running",
    waiting: "Waiting",
  },
  typeFallback: "Chat",
};

function makeSession(overrides: Partial<AgentSessionDto>): AgentSessionDto {
  return {
    agent_id: "engenty.copilot",
    archived_at: null,
    created_at: "2026-05-17T00:00:00.000Z",
    created_by_user_id: "user-1",
    id: "session-1",
    metadata: {},
    route_context: {},
    status: "completed",
    summary: null,
    tenant_id: "tenant-1",
    title: null,
    updated_at: "2026-05-17T00:00:00.000Z",
    workspace_key: null,
    ...overrides,
  };
}

describe("organizeSessionList", () => {
  it("filters by agent, status, and archived state", () => {
    const groups = organizeSessionList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        agentId: "knowledge-base.manager",
        status: "waiting",
      },
      sessions: [
        makeSession({ id: "wrong-agent", status: "waiting" }),
        makeSession({
          agent_id: "knowledge-base.manager",
          archived_at: "2026-05-19T00:00:00.000Z",
          id: "archived",
          status: "waiting",
        }),
        makeSession({
          agent_id: "knowledge-base.manager",
          id: "match",
          status: "waiting",
        }),
      ],
    });

    expect(groups[0]?.sessions.map((session) => session.id)).toEqual(["match"]);
  });

  it("sorts by agent label and groups by agent", () => {
    const groups = organizeSessionList({
      agentLabel: (id) =>
        id === "knowledge-base.manager" ? "Knowledge Base" : "Copilot",
      labels,
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        archived: "all",
        groupBy: "agent",
        sortBy: "agent",
        sortOrder: "asc",
      },
      sessions: [
        makeSession({ id: "kb", agent_id: "knowledge-base.manager" }),
        makeSession({ id: "copilot", agent_id: "engenty.copilot" }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Copilot",
      "Knowledge Base",
    ]);
  });

  it("groups recent sessions by updated date", () => {
    const groups = organizeSessionList({
      agentLabel: (id) => id,
      labels,
      now: new Date("2026-05-20T12:00:00.000Z"),
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        archived: "all",
        groupBy: "date",
      },
      sessions: [
        makeSession({ id: "old", updated_at: "2026-05-01T00:00:00.000Z" }),
        makeSession({
          id: "yesterday",
          updated_at: "2026-05-19T10:00:00.000Z",
        }),
        makeSession({ id: "today", updated_at: "2026-05-20T10:00:00.000Z" }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Older",
    ]);
  });

  it("filters sessions by maximum age", () => {
    const groups = organizeSessionList({
      agentLabel: (id) => id,
      labels,
      now: new Date("2026-05-20T12:00:00.000Z"),
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        age: "last-two-days",
        archived: "all",
      },
      sessions: [
        makeSession({ id: "old", updated_at: "2026-05-01T00:00:00.000Z" }),
        makeSession({
          id: "two-days",
          updated_at: "2026-05-19T10:00:00.000Z",
        }),
        makeSession({ id: "today", updated_at: "2026-05-20T10:00:00.000Z" }),
      ],
    });

    expect(groups[0]?.sessions.map((session) => session.id)).toEqual([
      "today",
      "two-days",
    ]);
  });

  it("groups sessions by derived type from route context", () => {
    const groups = organizeSessionList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        archived: "all",
        groupBy: "type",
      },
      sessions: [
        makeSession({
          id: "detail",
          route_context: { route_key: "article-detail" },
        }),
        makeSession({
          id: "chat",
          route_context: { routeKey: "chat" },
        }),
        makeSession({
          id: "fallback",
          route_context: {},
        }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Article Detail",
      "Chat",
    ]);
    expect(groups[1]?.sessions.map((session) => session.id)).toEqual([
      "chat",
      "fallback",
    ]);
  });

  it("groups sessions by workspace_key when route type is absent", () => {
    const groups = organizeSessionList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_SESSION_LIST_PREFS,
        archived: "all",
        groupBy: "type",
      },
      sessions: [
        makeSession({
          id: "task-a",
          route_context: {},
          workspace_key: "task:ENG-142",
        }),
        makeSession({
          id: "task-b",
          route_context: {},
          workspace_key: "task:ENG-9",
        }),
        makeSession({
          id: "generic",
          route_context: {},
          workspace_key: null,
        }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Chat",
      "Task ENG 9",
      "Task ENG 142",
    ]);
    expect(groups[0]?.sessions.map((session) => session.id)).toEqual([
      "generic",
    ]);
  });
});
