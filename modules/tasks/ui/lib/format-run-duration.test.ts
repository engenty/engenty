import { describe, expect, it } from "vitest";
import { formatRunDuration } from "../components/live-task-runs-panel.js";

describe("formatRunDuration", () => {
  it("reports sub-minute runs in seconds", () => {
    expect(
      formatRunDuration("2026-07-23T10:00:00Z", "2026-07-23T10:00:14Z")
    ).toBe("14s");
  });

  it("reports sub-hour runs in minutes", () => {
    expect(
      formatRunDuration("2026-07-23T10:00:00Z", "2026-07-23T10:32:00Z")
    ).toBe("32m");
  });

  it("reports longer runs in hours", () => {
    expect(
      formatRunDuration("2026-07-23T10:00:00Z", "2026-07-23T11:00:00Z")
    ).toBe("1h");
  });

  // A duration inferred from one timestamp would be invented, and an unfinished
  // run has no duration yet — both must render nothing rather than "0s".
  it("returns null when either end is missing", () => {
    expect(formatRunDuration("2026-07-23T10:00:00Z", null)).toBeNull();
    expect(formatRunDuration(null, "2026-07-23T10:00:00Z")).toBeNull();
  });

  it("returns null for unparseable or reversed intervals", () => {
    expect(formatRunDuration("nonsense", "2026-07-23T10:00:00Z")).toBeNull();
    expect(
      formatRunDuration("2026-07-23T11:00:00Z", "2026-07-23T10:00:00Z")
    ).toBeNull();
  });
});
