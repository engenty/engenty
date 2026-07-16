import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "./activity-entries";
import {
  ACTIVITY_NO_AGENT_ID,
  filterAndSortActivityEntries,
  groupActivityList,
} from "./activity-list-state";

function entry(partial: Partial<ActivityEntry>): ActivityEntry {
  return {
    agentId: "agent-a",
    entityId: "thread-1",
    key: `session:${partial.entityId ?? "thread-1"}`,
    status: "completed",
    statusKind: "finished",
    timestamp: "2026-06-12T09:30:00Z",
    title: "Quarterly report",
    ...partial,
  };
}

const NAMES = new Map([
  ["agent-a", "Alpha"],
  ["agent-b", "Beta"],
]);

const BASE = {
  agentId: null,
  search: "",
  sortBy: "timestamp" as const,
  sortOrder: "desc" as const,
  status: "all" as const,
};

describe("filterAndSortActivityEntries", () => {
  it("matches the agent display name in search", () => {
    const entries = [
      entry({ agentId: "agent-a", entityId: "t1" }),
      entry({ agentId: "agent-b", entityId: "t2" }),
    ];
    const result = filterAndSortActivityEntries(
      entries,
      { ...BASE, search: "beta" },
      NAMES
    );
    expect(result.map((item) => item.entityId)).toEqual(["t2"]);
  });

  it("sorts by timestamp in the requested direction", () => {
    const entries = [
      entry({ entityId: "old", timestamp: "2026-06-12T08:00:00Z" }),
      entry({ entityId: "new", timestamp: "2026-06-12T11:00:00Z" }),
    ];
    const asc = filterAndSortActivityEntries(
      entries,
      { ...BASE, sortOrder: "asc" },
      NAMES
    );
    expect(asc.map((item) => item.entityId)).toEqual(["old", "new"]);
  });

  it("sorts by agent display name", () => {
    const entries = [
      entry({ agentId: "agent-b", entityId: "t2" }),
      entry({ agentId: "agent-a", entityId: "t1" }),
    ];
    const result = filterAndSortActivityEntries(
      entries,
      { ...BASE, sortBy: "agent", sortOrder: "asc" },
      NAMES
    );
    expect(result.map((item) => item.entityId)).toEqual(["t1", "t2"]);
  });
});

describe("groupActivityList", () => {
  it("groups by agent alphabetically with the no-agent bucket last", () => {
    const entries = [
      entry({ agentId: null, entityId: "t3" }),
      entry({ agentId: "agent-b", entityId: "t2" }),
      entry({ agentId: "agent-a", entityId: "t1" }),
    ];
    const groups = groupActivityList(entries, "agent", NAMES);
    expect(groups.map((group) => group.id)).toEqual([
      "agent-a",
      "agent-b",
      ACTIVITY_NO_AGENT_ID,
    ]);
  });

  it("orders status groups running → failed → finished", () => {
    const entries = [
      entry({ entityId: "t1", statusKind: "finished" }),
      entry({ entityId: "t2", statusKind: "running" }),
      entry({ entityId: "t3", statusKind: "failed" }),
    ];
    const groups = groupActivityList(entries, "status", NAMES);
    expect(groups.map((group) => group.id)).toEqual([
      "running",
      "failed",
      "finished",
    ]);
  });

  it("carries day metadata for day groups and a single group for none", () => {
    const entries = [entry({})];
    const dayGroups = groupActivityList(entries, "day", NAMES);
    expect(dayGroups).toHaveLength(1);
    expect(dayGroups[0].day?.timestamp).toBe("2026-06-12T09:30:00Z");
    const none = groupActivityList(entries, "none", NAMES);
    expect(none).toEqual([{ entries, id: "all" }]);
  });
});
