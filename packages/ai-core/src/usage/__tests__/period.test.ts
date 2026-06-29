import { describe, expect, it } from "vitest";
import { resolveCurrentPeriod } from "../period.js";

describe("resolveCurrentPeriod", () => {
  it("snaps calendar/month to start of UTC month", () => {
    const period = resolveCurrentPeriod(
      { period_mode: "calendar", period_unit: "month", period_anchor: null },
      new Date("2026-03-15T12:34:56Z")
    );
    expect(period.period_start).toBe("2026-03-01T00:00:00.000Z");
    expect(period.period_end).toBe("2026-04-01T00:00:00.000Z");
  });

  it("rolls calendar/month forward across year boundary", () => {
    const period = resolveCurrentPeriod(
      { period_mode: "calendar", period_unit: "month", period_anchor: null },
      new Date("2026-12-31T23:59:59Z")
    );
    expect(period.period_start).toBe("2026-12-01T00:00:00.000Z");
    expect(period.period_end).toBe("2027-01-01T00:00:00.000Z");
  });

  it("snaps calendar/week to Monday 00:00 UTC", () => {
    // 2026-03-04 is a Wednesday in UTC.
    const period = resolveCurrentPeriod(
      { period_mode: "calendar", period_unit: "week", period_anchor: null },
      new Date("2026-03-04T10:00:00Z")
    );
    // Monday before Wednesday is 2026-03-02.
    expect(period.period_start).toBe("2026-03-02T00:00:00.000Z");
    expect(period.period_end).toBe("2026-03-09T00:00:00.000Z");
  });

  it("snaps calendar/day to start of UTC day", () => {
    const period = resolveCurrentPeriod(
      { period_mode: "calendar", period_unit: "day", period_anchor: null },
      new Date("2026-05-04T08:30:00Z")
    );
    expect(period.period_start).toBe("2026-05-04T00:00:00.000Z");
    expect(period.period_end).toBe("2026-05-05T00:00:00.000Z");
  });

  it("returns last 30 days for rolling/month without anchor", () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const period = resolveCurrentPeriod(
      { period_mode: "rolling", period_unit: "month", period_anchor: null },
      now
    );
    expect(period.period_end).toBe("2026-05-01T12:00:00.000Z");
    // 30 days back from May 1 12:00Z = April 1 12:00Z.
    expect(period.period_start).toBe("2026-04-01T12:00:00.000Z");
  });

  it("anchors rolling windows so resets stay deterministic", () => {
    const period = resolveCurrentPeriod(
      {
        period_mode: "rolling",
        period_unit: "month",
        period_anchor: "2026-01-15",
      },
      new Date("2026-04-20T00:00:00Z")
    );
    // 30-day windows from 2026-01-15: 01-15->02-14, 02-14->03-16, 03-16->04-15, 04-15->05-15.
    expect(period.period_start).toBe("2026-04-15T00:00:00.000Z");
    expect(period.period_end).toBe("2026-05-15T00:00:00.000Z");
  });
});
