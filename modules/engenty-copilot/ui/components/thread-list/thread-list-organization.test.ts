import { describe, expect, it } from "vitest";
import type { AgentThreadDto } from "../../../src/lib/agent-thread-types.js";
import {
  DEFAULT_THREAD_LIST_PREFS,
  organizeThreadList,
  type ThreadListOrganizationLabels,
} from "./thread-list-organization.js";

const labels: ThreadListOrganizationLabels = {
  activeChats: "Active",
  archivedChats: "Archived",
  dateOlder: "Older",
  datePreviousSevenDays: "Previous 7 days",
  dateToday: "Today",
  dateYesterday: "Yesterday",
  status: {
    completed: "Completed",
    draft: "Draft",
    failed: "Failed",
    idle: "Idle",
    running: "Running",
    waiting: "Waiting",
  },
  typeFallback: "Chat",
};

function makeThread(overrides: Partial<AgentThreadDto>): AgentThreadDto {
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

describe("organizeThreadList", () => {
  it("filters by agent, status, and archived state", () => {
    const groups = organizeThreadList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        agentId: "knowledge-base.manager",
        status: "waiting",
      },
      threads: [
        makeThread({ id: "wrong-agent", status: "waiting" }),
        makeThread({
          agent_id: "knowledge-base.manager",
          archived_at: "2026-05-19T00:00:00.000Z",
          id: "archived",
          status: "waiting",
        }),
        makeThread({
          agent_id: "knowledge-base.manager",
          id: "match",
          status: "waiting",
        }),
      ],
    });

    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual(["match"]);
  });

  it("sorts by agent label and groups by agent", () => {
    const groups = organizeThreadList({
      agentLabel: (id) =>
        id === "knowledge-base.manager" ? "Knowledge Base" : "Copilot",
      labels,
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        archived: "all",
        groupBy: "agent",
        sortBy: "agent",
        sortOrder: "asc",
      },
      threads: [
        makeThread({ id: "kb", agent_id: "knowledge-base.manager" }),
        makeThread({ id: "copilot", agent_id: "engenty.copilot" }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Copilot",
      "Knowledge Base",
    ]);
  });

  it("groups recent sessions by updated date", () => {
    const groups = organizeThreadList({
      agentLabel: (id) => id,
      labels,
      now: new Date("2026-05-20T12:00:00.000Z"),
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        archived: "all",
        groupBy: "date",
      },
      threads: [
        makeThread({ id: "old", updated_at: "2026-05-01T00:00:00.000Z" }),
        makeThread({
          id: "yesterday",
          updated_at: "2026-05-19T10:00:00.000Z",
        }),
        makeThread({ id: "today", updated_at: "2026-05-20T10:00:00.000Z" }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Today",
      "Yesterday",
      "Older",
    ]);
  });

  it("filters sessions by maximum age", () => {
    const groups = organizeThreadList({
      agentLabel: (id) => id,
      labels,
      now: new Date("2026-05-20T12:00:00.000Z"),
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        age: "last-two-days",
        archived: "all",
      },
      threads: [
        makeThread({ id: "old", updated_at: "2026-05-01T00:00:00.000Z" }),
        makeThread({
          id: "two-days",
          updated_at: "2026-05-19T10:00:00.000Z",
        }),
        makeThread({ id: "today", updated_at: "2026-05-20T10:00:00.000Z" }),
      ],
    });

    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual([
      "today",
      "two-days",
    ]);
  });

  it("groups sessions by derived type from route context", () => {
    const groups = organizeThreadList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        archived: "all",
        groupBy: "type",
      },
      threads: [
        makeThread({
          id: "detail",
          route_context: { route_key: "article-detail" },
        }),
        makeThread({
          id: "chat",
          route_context: { routeKey: "chat" },
        }),
        makeThread({
          id: "fallback",
          route_context: {},
        }),
      ],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "Article Detail",
      "Chat",
    ]);
    expect(groups[1]?.threads.map((thread) => thread.id)).toEqual([
      "chat",
      "fallback",
    ]);
  });

  it("groups sessions by workspace_key when route type is absent", () => {
    const groups = organizeThreadList({
      agentLabel: (id) => id,
      labels,
      prefs: {
        ...DEFAULT_THREAD_LIST_PREFS,
        archived: "all",
        groupBy: "type",
      },
      threads: [
        makeThread({
          id: "task-a",
          route_context: {},
          workspace_key: "task:ENG-142",
        }),
        makeThread({
          id: "task-b",
          route_context: {},
          workspace_key: "task:ENG-9",
        }),
        makeThread({
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
    expect(groups[0]?.threads.map((thread) => thread.id)).toEqual(["generic"]);
  });
});
