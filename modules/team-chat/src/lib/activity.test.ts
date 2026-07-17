import { describe, expect, it } from "vitest";
import { formatActivityLine } from "./activity.js";

describe("formatActivityLine", () => {
  it("renders a status transition", () => {
    expect(
      formatActivityLine({
        event_type: "tasks.status_changed",
        payload: { from: "todo", to: "done" },
      })
    ).toBe("Task status changed · todo → done");
  });

  it("includes title and clamps comments", () => {
    const line = formatActivityLine({
      event_type: "tasks.comment_added",
      payload: { comment: "x".repeat(200), title: "Ship it" },
    });
    expect(line).toContain('Task comment added · "Ship it"');
    expect(line.length).toBeLessThan(160);
  });

  it("survives missing payloads", () => {
    expect(
      formatActivityLine({ event_type: "tasks.checked_out", payload: null })
    ).toBe("Task checked out");
  });
});
