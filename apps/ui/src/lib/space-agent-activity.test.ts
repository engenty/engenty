import { describe, expect, it } from "vitest";
import { latestConversationByAgent } from "./space-agent-activity";

describe("latestConversationByAgent", () => {
  it("keeps the newest thread per agent", () => {
    const latest = latestConversationByAgent([
      {
        agentId: "hired.friend",
        title: "Older",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        agentId: "hired.friend",
        title: "Newest",
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
      {
        agentId: "tasks.assist",
        title: "Tasks chat",
        updatedAt: "2026-01-15T00:00:00.000Z",
      },
    ]);
    expect(latest.get("hired.friend")).toEqual({
      title: "Newest",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(latest.get("tasks.assist")?.title).toBe("Tasks chat");
    expect(latest.has("missing")).toBe(false);
  });

  it("keeps a null title so the row can fall back to untitled copy", () => {
    const latest = latestConversationByAgent([
      {
        agentId: "hired.friend",
        title: null,
        updatedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
    expect(latest.get("hired.friend")?.title).toBeNull();
  });
});
