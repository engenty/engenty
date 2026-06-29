import { describe, expect, it } from "vitest";
import type { AiAdminSessionRow } from "../../lib/admin/ai-runtime-types";
import { groupActivityEntriesByDay } from "./activity-day-groups";
import {
  filterActivityEntries,
  hasRunningActivityEntry,
  toActivityEntries,
} from "./activity-entries";

function session(partial: Partial<AiAdminSessionRow>): AiAdminSessionRow {
  return {
    created_at: "2026-06-12T09:00:00Z",
    current_agent_id: "engenty.copilot",
    id: "thread-1",
    last_action_id: null,
    last_message_at: "2026-06-12T09:30:00Z",
    route_context: {},
    status: "completed",
    summary: null,
    tenant_id: "t1",
    title: "Quarterly report",
    updated_at: "2026-06-12T09:30:00Z",
    user_id: "u1",
    ...partial,
  };
}

describe("toActivityEntries", () => {
  it("orders sessions newest first", () => {
    const entries = toActivityEntries({
      sessions: [
        session({ id: "old", last_message_at: "2026-06-12T08:00:00Z" }),
        session({ id: "new", last_message_at: "2026-06-12T11:00:00Z" }),
      ],
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "session:new",
      "session:old",
    ]);
  });

  it("maps session statuses to filter kinds", () => {
    const entries = toActivityEntries({
      sessions: [
        session({ id: "waiting", status: "waiting" }),
        session({ id: "idle", status: "idle" }),
        session({ id: "failed", status: "failed" }),
      ],
    });
    const kinds = new Map(entries.map((e) => [e.key, e.statusKind]));
    expect(kinds.get("session:waiting")).toBe("running");
    expect(kinds.get("session:idle")).toBe("other");
    expect(kinds.get("session:failed")).toBe("failed");
  });
});

describe("filterActivityEntries", () => {
  const entries = toActivityEntries({
    sessions: [
      session({ current_agent_id: "a1", id: "s1", status: "running" }),
      session({ current_agent_id: "a2", id: "s2", title: "Find leads" }),
    ],
  });

  it("filters by status and agent", () => {
    const base = { agentId: null, search: "", status: "all" } as const;
    expect(
      filterActivityEntries(entries, { ...base, status: "running" })[0]?.key
    ).toBe("session:s1");
    expect(
      filterActivityEntries(entries, { ...base, agentId: "a2" })[0]?.key
    ).toBe("session:s2");
  });

  it("searches titles case-insensitively", () => {
    const hits = filterActivityEntries(entries, {
      agentId: null,
      search: "LEADS",
      status: "all",
    });
    expect(hits.map((entry) => entry.key)).toEqual(["session:s2"]);
  });
});

describe("groupActivityEntriesByDay", () => {
  it("groups into today / yesterday / date buckets", () => {
    const now = new Date("2026-06-12T12:00:00");
    const entries = toActivityEntries({
      sessions: [
        session({ id: "today", last_message_at: "2026-06-12T10:00:00" }),
        session({ id: "yesterday", last_message_at: "2026-06-11T10:00:00" }),
        session({ id: "older", last_message_at: "2026-06-01T10:00:00" }),
      ],
    });
    const groups = groupActivityEntriesByDay(entries, now);
    expect(groups.map((group) => group.kind)).toEqual([
      "today",
      "yesterday",
      "date",
    ]);
    expect(groups[0]?.entries[0]?.key).toBe("session:today");
  });
});

describe("hasRunningActivityEntry", () => {
  it("is true only while a running entry is present", () => {
    const idle = toActivityEntries({ sessions: [session({})] });
    expect(hasRunningActivityEntry(idle)).toBe(false);
    const live = toActivityEntries({
      sessions: [session({ status: "running" })],
    });
    expect(hasRunningActivityEntry(live)).toBe(true);
  });
});
