import { describe, expect, it, vi } from "vitest";
import { formatInboxRelativeTime } from "./format-relative-time.js";

describe("formatInboxRelativeTime", () => {
  it("returns empty for missing or invalid values", () => {
    expect(formatInboxRelativeTime(null, "en")).toBe("");
    expect(formatInboxRelativeTime("not-a-date", "en")).toBe("");
  });

  it("formats recent timestamps relative to now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00Z"));
    expect(formatInboxRelativeTime("2026-07-15T10:00:00Z", "en")).toMatch(
      /hour/i
    );
    vi.useRealTimers();
  });
});
