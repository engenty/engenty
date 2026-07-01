import { describe, expect, it } from "vitest";
import {
  itemLogFromEntry,
  parseRunItemLogs,
  resolveRunStatusFromItemLogs,
  summarizeRunItemLogs,
} from "./source-run-item-log.js";

describe("source-run-item-log", () => {
  it("summarizes all-failed runs", () => {
    const logs = [
      itemLogFromEntry(
        {
          item_key: "https://example.com/a",
          source_url: "https://example.com/a",
        },
        "failed",
        "HTTP 403"
      ),
    ];
    expect(summarizeRunItemLogs(logs)).toBe("1 item(s) failed to retrieve");
  });

  it("summarizes partial failures", () => {
    const logs = [
      itemLogFromEntry(
        { item_key: "a", source_url: "https://example.com/a" },
        "created"
      ),
      itemLogFromEntry(
        { item_key: "b", source_url: "https://example.com/b" },
        "failed",
        "timeout"
      ),
    ];
    expect(summarizeRunItemLogs(logs)).toBe(
      "1 of 2 item(s) failed to retrieve"
    );
  });

  it("parses item logs from run metadata", () => {
    const logs = parseRunItemLogs({
      item_logs: [
        {
          item_key: "https://example.com/a",
          outcome: "failed",
          message: "SSL error",
          source_url: "https://example.com/a",
          title: "Page A",
        },
      ],
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.outcome).toBe("failed");
    expect(logs[0]?.message).toBe("SSL error");
  });

  it("marks run failed when any item failed", () => {
    expect(
      resolveRunStatusFromItemLogs([
        itemLogFromEntry(
          { item_key: "a", source_url: "https://example.com/a" },
          "created"
        ),
        itemLogFromEntry(
          { item_key: "b", source_url: "https://example.com/b" },
          "failed",
          "timeout"
        ),
      ])
    ).toBe("failed");
  });

  it("marks run succeeded when no item failed", () => {
    expect(
      resolveRunStatusFromItemLogs([
        itemLogFromEntry(
          { item_key: "a", source_url: "https://example.com/a" },
          "created"
        ),
      ])
    ).toBe("succeeded");
  });
});
