import { describe, expect, it } from "vitest";
import {
  formatActivityRelativeTime,
  formatActivityTimeLabel,
} from "./format-activity-time.js";

describe("formatActivityRelativeTime", () => {
  const now = new Date("2026-05-23T12:00:00.000Z").getTime();

  it("returns just_now under one minute", () => {
    expect(
      formatActivityRelativeTime("2026-05-23T11:59:30.000Z", now).kind
    ).toBe("just_now");
  });

  it("returns compact minutes", () => {
    expect(formatActivityRelativeTime("2026-05-23T11:50:00.000Z", now)).toEqual(
      { kind: "relative", value: "10m" }
    );
  });

  it("returns compact hours", () => {
    expect(formatActivityRelativeTime("2026-05-23T09:00:00.000Z", now)).toEqual(
      { kind: "relative", value: "3h" }
    );
  });

  it("returns absolute date for older events", () => {
    expect(formatActivityRelativeTime("2026-03-30T09:00:00.000Z", now)).toEqual(
      { kind: "absolute", value: "Mar 30, 2026" }
    );
  });
});

describe("formatActivityTimeLabel", () => {
  const now = new Date("2026-05-23T12:00:00.000Z").getTime();
  const t = (key: string, options?: Record<string, unknown>) => {
    if (key === "detail.activityTimeJustNow") {
      return "just now";
    }
    if (key === "detail.activityTimeAgo") {
      return `${options?.value} ago`;
    }
    return key;
  };

  it("maps relative and absolute values through i18n", () => {
    expect(formatActivityTimeLabel("2026-05-23T11:59:40.000Z", t, now)).toBe(
      "just now"
    );
    expect(formatActivityTimeLabel("2026-05-23T11:50:00.000Z", t, now)).toBe(
      "10m ago"
    );
    expect(formatActivityTimeLabel("2026-03-30T09:00:00.000Z", t, now)).toBe(
      "Mar 30, 2026"
    );
  });
});
