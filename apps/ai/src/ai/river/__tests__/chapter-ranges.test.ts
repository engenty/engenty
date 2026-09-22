import { describe, expect, it } from "vitest";
import {
  dueChapterRanges,
  formatChapterRange,
  startOfLocalDay,
  startOfLocalWeek,
} from "../chapter-ranges.js";

const VIENNA = "Europe/Vienna";

describe("local day and week boundaries", () => {
  it("finds midnight in the person's zone, not the server's", () => {
    // 2026-09-16 01:30 in Vienna is still 2026-09-15 23:30 UTC.
    const instant = new Date("2026-09-15T23:30:00Z");
    expect(startOfLocalDay(instant, VIENNA).toISOString()).toBe(
      "2026-09-15T22:00:00.000Z"
    );
    expect(startOfLocalDay(instant, "UTC").toISOString()).toBe(
      "2026-09-15T00:00:00.000Z"
    );
  });

  it("starts the week on Monday", () => {
    // Wednesday 2026-09-16 → Monday 2026-09-14 00:00 Vienna.
    expect(
      startOfLocalWeek(new Date("2026-09-16T10:00:00Z"), VIENNA).toISOString()
    ).toBe("2026-09-13T22:00:00.000Z");
  });

  it("survives the autumn DST change", () => {
    // Vienna falls back on 2026-10-25; the day is 25 hours long.
    const start = startOfLocalDay(new Date("2026-10-25T12:00:00Z"), VIENNA);
    expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(
      startOfLocalDay(new Date("2026-10-26T12:00:00Z"), VIENNA).toISOString()
    ).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("dueChapterRanges", () => {
  it("cuts one chapter per complete day since the last one, never today", () => {
    const ranges = dueChapterRanges({
      dailyFrom: new Date("2026-09-14T15:00:00Z"),
      now: new Date("2026-09-17T08:00:00Z"),
      timeZone: "UTC",
      weeklyFrom: new Date("2026-09-17T00:00:00Z"),
    });
    expect(
      ranges.map((range) => [
        range.kind,
        range.start.toISOString(),
        range.end.toISOString(),
      ])
    ).toEqual([
      ["daily", "2026-09-14T15:00:00.000Z", "2026-09-15T00:00:00.000Z"],
      ["daily", "2026-09-15T00:00:00.000Z", "2026-09-16T00:00:00.000Z"],
      ["daily", "2026-09-16T00:00:00.000Z", "2026-09-17T00:00:00.000Z"],
    ]);
  });

  it("cuts a weekly chapter once a Monday has passed", () => {
    const ranges = dueChapterRanges({
      dailyFrom: new Date("2026-09-21T00:00:00Z"),
      now: new Date("2026-09-22T09:00:00Z"),
      timeZone: "UTC",
      weeklyFrom: new Date("2026-09-10T12:00:00Z"),
    });
    expect(ranges.map((range) => range.kind)).toEqual([
      "daily",
      "weekly",
      "weekly",
    ]);
    expect(ranges[1]?.start.toISOString()).toBe("2026-09-10T12:00:00.000Z");
    expect(ranges[1]?.end.toISOString()).toBe("2026-09-14T00:00:00.000Z");
    expect(ranges[2]?.end.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });

  it("is quiet when everything up to today is already covered", () => {
    expect(
      dueChapterRanges({
        dailyFrom: new Date("2026-09-17T00:00:00Z"),
        now: new Date("2026-09-17T20:00:00Z"),
        timeZone: "UTC",
        weeklyFrom: new Date("2026-09-14T00:00:00Z"),
      })
    ).toEqual([]);
  });

  it("folds an idle year into one chapter instead of a chapter a day", () => {
    const ranges = dueChapterRanges({
      dailyFrom: new Date("2025-01-01T00:00:00Z"),
      now: new Date("2026-09-17T08:00:00Z"),
      timeZone: "UTC",
      weeklyFrom: new Date("2026-09-17T00:00:00Z"),
    });
    const daily = ranges.filter((range) => range.kind === "daily");
    expect(daily[0]?.start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    // One folded range, then one per day inside the look-back window.
    expect(daily.length).toBeLessThanOrEqual(91);
    expect(daily.at(-1)?.end.toISOString()).toBe("2026-09-17T00:00:00.000Z");
  });
});

describe("formatChapterRange", () => {
  it("names the day a daily chapter covers, in the person's zone", () => {
    expect(
      formatChapterRange({
        end: new Date("2026-09-15T22:00:00Z"),
        kind: "daily",
        start: new Date("2026-09-14T22:00:00Z"),
        timeZone: VIENNA,
      })
    ).toBe("Tue 15 Sept");
  });

  it("names a week by its Monday and a manual cut by its span", () => {
    expect(
      formatChapterRange({
        end: new Date("2026-09-21T00:00:00Z"),
        kind: "weekly",
        start: new Date("2026-09-14T00:00:00Z"),
        timeZone: "UTC",
      })
    ).toBe("Week of 14 Sept");
    expect(
      formatChapterRange({
        end: new Date("2026-09-18T10:00:00Z"),
        kind: "manual",
        start: new Date("2026-09-16T09:00:00Z"),
        timeZone: "UTC",
      })
    ).toBe("16 Sept – 18 Sept");
  });
});
