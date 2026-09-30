import { describe, expect, it } from "vitest";
import { needsDateDivider } from "./transcript-date-divider.js";

describe("needsDateDivider", () => {
  const at = (minutes: number) =>
    new Date(Date.UTC(2026, 8, 24, 9, minutes)).toISOString();

  it("marks a pick-up after more than half an hour", () => {
    expect(needsDateDivider(at(0), at(31))).toBe(true);
    expect(needsDateDivider(at(0), at(30))).toBe(false);
  });

  it("needs a message before it, and reads a message without a time as now", () => {
    expect(needsDateDivider(null, at(59))).toBe(false);
    expect(needsDateDivider(at(0), null, Date.parse(at(45)))).toBe(true);
  });
});
