import { describe, expect, it } from "vitest";
import {
  timeEntryListFiltersSchema,
  timeEntrySummarizeFiltersSchema,
} from "../schema/zod.js";

describe("time entry query schemas", () => {
  it("accepts a valid list range within 90 days", () => {
    const parsed = timeEntryListFiltersSchema.parse({
      date_from: "2026-03-01",
      date_to: "2026-03-31",
    });
    expect(parsed.page).toBeUndefined();
  });

  it("rejects list ranges longer than 90 days", () => {
    expect(() =>
      timeEntryListFiltersSchema.parse({
        date_from: "2026-01-01",
        date_to: "2026-05-01",
      })
    ).toThrow(/90 days/);
  });

  it("accepts summarize ranges up to 366 days", () => {
    const parsed = timeEntrySummarizeFiltersSchema.parse({
      date_from: "2025-01-01",
      date_to: "2025-12-31",
      group_by: ["user", "project"],
    });
    expect(parsed.group_by).toEqual(["user", "project"]);
  });

  it("rejects summarize ranges longer than 366 days", () => {
    expect(() =>
      timeEntrySummarizeFiltersSchema.parse({
        date_from: "2024-01-01",
        date_to: "2026-01-01",
        group_by: ["day"],
      })
    ).toThrow(/366 days/);
  });
});
