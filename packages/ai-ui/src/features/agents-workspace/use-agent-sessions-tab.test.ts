import { describe, expect, it } from "vitest";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-api";
import {
  filterAdminSessions,
  sortAdminSessionsByRecency,
} from "./use-agent-sessions-tab";

function makeSession(overrides: Partial<AiAdminSessionRow>): AiAdminSessionRow {
  return {
    created_at: "2026-04-15T10:00:00.000Z",
    current_agent_id: "agent-1",
    id: "session-1",
    last_action_id: null,
    last_message_at: null,
    route_context: {},
    status: "idle",
    summary: null,
    tenant_id: "tenant-1",
    title: null,
    updated_at: "2026-04-15T10:00:00.000Z",
    user_id: "user-1",
    ...overrides,
  };
}

describe("filterAdminSessions", () => {
  const sessions: AiAdminSessionRow[] = [
    makeSession({
      current_agent_id: "marketing.copilot",
      id: "01900000-0000-7000-8000-000000000001",
      status: "running",
      title: "Quarterly review",
    }),
    makeSession({
      current_agent_id: "support.agent",
      id: "01900000-0000-7000-8000-000000000002",
      status: "completed",
      summary: "Refunded the customer",
      title: null,
    }),
  ];

  it("returns all sessions when the filter is empty", () => {
    expect(filterAdminSessions(sessions, "")).toHaveLength(2);
    expect(filterAdminSessions(sessions, "   ")).toHaveLength(2);
  });

  it("matches by exact status", () => {
    const result = filterAdminSessions(sessions, "running");
    expect(result.map((session) => session.id)).toEqual([sessions[0].id]);
  });

  it("matches by partial agent id, title, summary, or session id", () => {
    expect(
      filterAdminSessions(sessions, "marketing").map((session) => session.id)
    ).toEqual([sessions[0].id]);
    expect(
      filterAdminSessions(sessions, "quarterly").map((session) => session.id)
    ).toEqual([sessions[0].id]);
    expect(
      filterAdminSessions(sessions, "refund").map((session) => session.id)
    ).toEqual([sessions[1].id]);
    expect(
      filterAdminSessions(sessions, "0001").map((session) => session.id)
    ).toEqual([sessions[0].id]);
  });
});

describe("sortAdminSessionsByRecency", () => {
  it("sorts sessions by descending updated_at", () => {
    const older = makeSession({
      id: "older",
      updated_at: "2026-04-10T00:00:00.000Z",
    });
    const newer = makeSession({
      id: "newer",
      updated_at: "2026-04-16T00:00:00.000Z",
    });
    const middle = makeSession({
      id: "middle",
      updated_at: "2026-04-12T00:00:00.000Z",
    });

    expect(
      sortAdminSessionsByRecency([older, newer, middle]).map(
        (session) => session.id
      )
    ).toEqual(["newer", "middle", "older"]);
  });
});
