import { describe, expect, it } from "vitest";
import {
  deriveSessionStatsSummary,
  formatRelativeTime,
  formatRelativeTimeWithAbsolute,
} from "./derive-session-stats";

describe("deriveSessionStatsSummary", () => {
  it("returns zeroed counts when stats are missing", () => {
    const summary = deriveSessionStatsSummary(null);
    expect(summary.totalSessions).toBe(0);
    expect(summary.totalRuns).toBe(0);
    expect(summary.activeSessions).toBe(0);
    expect(summary.failedSessions).toBe(0);
    expect(summary.completedSessions).toBe(0);
    expect(summary.lastMessageAt).toBeNull();
    expect(summary.byStatus.idle).toBe(0);
  });

  it("rolls up running + waiting into active sessions", () => {
    const summary = deriveSessionStatsSummary({
      sessions_total: 9,
      runs_total: 17,
      last_message_at: "2026-05-01T10:00:00.000Z",
      sessions_by_status: {
        idle: 4,
        running: 2,
        waiting: 1,
        failed: 1,
        completed: 1,
      },
    });
    expect(summary.totalSessions).toBe(9);
    expect(summary.totalRuns).toBe(17);
    expect(summary.activeSessions).toBe(3);
    expect(summary.failedSessions).toBe(1);
    expect(summary.completedSessions).toBe(1);
    expect(summary.byStatus.idle).toBe(4);
    expect(summary.lastMessageAt).toBe("2026-05-01T10:00:00.000Z");
  });

  it("tolerates partial status maps from older payloads", () => {
    const summary = deriveSessionStatsSummary({
      sessions_total: 2,
      runs_total: 0,
      last_message_at: null,
      sessions_by_status: {
        running: 1,
      } as never,
    });
    expect(summary.activeSessions).toBe(1);
    expect(summary.byStatus.completed).toBe(0);
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-05-07T19:00:00.000Z");

  it("returns dash for missing or invalid input", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
    expect(formatRelativeTime("not-a-date", now)).toBe("—");
  });

  it("uses Just now for sub-30s deltas", () => {
    expect(
      formatRelativeTime(new Date(now.getTime() - 5000).toISOString(), now)
    ).toBe("Just now");
  });

  it("formats seconds, minutes, and hours", () => {
    expect(
      formatRelativeTime(new Date(now.getTime() - 45_000).toISOString(), now)
    ).toBe("45s ago");
    expect(
      formatRelativeTime(
        new Date(now.getTime() - 5 * 60_000).toISOString(),
        now
      )
    ).toBe("5m ago");
    expect(
      formatRelativeTime(
        new Date(now.getTime() - 3 * 60 * 60_000).toISOString(),
        now
      )
    ).toBe("3h ago");
  });

  it("falls back to days for older values", () => {
    expect(
      formatRelativeTime(
        new Date(now.getTime() - 5 * 24 * 60 * 60_000).toISOString(),
        now
      )
    ).toBe("5d ago");
  });

  it("adds an absolute timestamp when requested", () => {
    const iso = new Date(now.getTime() - 45_000).toISOString();
    expect(formatRelativeTimeWithAbsolute(iso, now)).toContain("45s ago (");
  });
});
