import { afterEach, describe, expect, it, vi } from "vitest";
import { formatKbDate, formatKbListDate } from "./article-datetime.js";

describe("formatKbDate", () => {
  it("formats ISO date-only strings in long locale style", () => {
    expect(formatKbDate("2021-09-01", "de")).toMatch(
      /1\.?\s*September\s*2021/i
    );
    expect(formatKbDate("2021-09-01", "en-US")).toMatch(
      /September\s+1,\s+2021/i
    );
  });

  it("returns the raw value when parsing fails", () => {
    expect(formatKbDate("not-a-date", "en")).toBe("not-a-date");
  });
});

describe("formatKbListDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses relative labels for updates within a week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
    const { label, title } = formatKbListDate("2026-06-02T08:00:00Z", "en-US");
    expect(label).toMatch(/hour/i);
    expect(title.length).toBeGreaterThan(0);
  });

  it("uses a long calendar date for older updates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:00:00Z"));
    const { label } = formatKbListDate("2026-05-01T08:00:00Z", "de");
    expect(label).toMatch(/1\.?\s*Mai\s*2026/i);
  });
});
