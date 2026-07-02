import { describe, expect, it } from "vitest";
import { isWithinQuietHours } from "../quiet-hours.js";

function utc(hours: number, minutes = 0): Date {
  return new Date(Date.UTC(2026, 0, 15, hours, minutes));
}

describe("isWithinQuietHours", () => {
  it("matches inside a same-day window", () => {
    expect(isWithinQuietHours("08:00-17:00", utc(12))).toBe(true);
    expect(isWithinQuietHours("08:00-17:00", utc(7, 59))).toBe(false);
    expect(isWithinQuietHours("08:00-17:00", utc(17))).toBe(false);
  });

  it("start is inclusive, end is exclusive", () => {
    expect(isWithinQuietHours("08:00-17:00", utc(8))).toBe(true);
    expect(isWithinQuietHours("08:00-17:00", utc(16, 59))).toBe(true);
  });

  it("supports windows wrapping midnight", () => {
    expect(isWithinQuietHours("22:00-06:00", utc(23))).toBe(true);
    expect(isWithinQuietHours("22:00-06:00", utc(3))).toBe(true);
    expect(isWithinQuietHours("22:00-06:00", utc(12))).toBe(false);
    expect(isWithinQuietHours("22:00-06:00", utc(6))).toBe(false);
  });
});
