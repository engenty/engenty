import { describe, expect, it } from "vitest";
import type { AiAdminThreadRow } from "../../lib/admin/ai-runtime-api.js";
import {
  filterAdminThreads,
  sortAdminThreadsByRecency,
} from "./use-agent-threads-tab.js";

function makeThread(overrides: Partial<AiAdminThreadRow>): AiAdminThreadRow {
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

describe("filterAdminThreads", () => {
  const threads: AiAdminThreadRow[] = [
    makeThread({
      current_agent_id: "marketing.copilot",
      id: "01900000-0000-7000-8000-000000000001",
      status: "running",
      title: "Quarterly review",
    }),
    makeThread({
      current_agent_id: "support.agent",
      id: "01900000-0000-7000-8000-000000000002",
      status: "completed",
      summary: "Refunded the customer",
      title: null,
    }),
  ];

  it("returns all threads when the filter is empty", () => {
    expect(filterAdminThreads(threads, "")).toHaveLength(2);
    expect(filterAdminThreads(threads, "   ")).toHaveLength(2);
  });

  it("matches by exact status", () => {
    const result = filterAdminThreads(threads, "running");
    expect(result.map((thread) => thread.id)).toEqual([threads[0].id]);
  });

  it("matches by partial agent id, title, summary, or session id", () => {
    expect(
      filterAdminThreads(threads, "marketing").map((thread) => thread.id)
    ).toEqual([threads[0].id]);
    expect(
      filterAdminThreads(threads, "quarterly").map((thread) => thread.id)
    ).toEqual([threads[0].id]);
    expect(
      filterAdminThreads(threads, "refund").map((thread) => thread.id)
    ).toEqual([threads[1].id]);
    expect(
      filterAdminThreads(threads, "0001").map((thread) => thread.id)
    ).toEqual([threads[0].id]);
  });
});

describe("sortAdminThreadsByRecency", () => {
  it("sorts threads by descending updated_at", () => {
    const older = makeThread({
      id: "older",
      updated_at: "2026-04-10T00:00:00.000Z",
    });
    const newer = makeThread({
      id: "newer",
      updated_at: "2026-04-16T00:00:00.000Z",
    });
    const middle = makeThread({
      id: "middle",
      updated_at: "2026-04-12T00:00:00.000Z",
    });

    expect(
      sortAdminThreadsByRecency([older, newer, middle]).map(
        (thread) => thread.id
      )
    ).toEqual(["newer", "middle", "older"]);
  });
});
