import { describe, expect, it } from "vitest";
import {
  getGrandTotal,
  getTotalHoursForDay,
  getTotalHoursForRow,
} from "./utils.js";

describe("time-tracking utils", () => {
  const entries = [
    {
      id: "1",
      user_id: "u1",
      project_id: "p1",
      phase_id: null,
      task_id: null,
      date: "2026-02-23",
      hours: 1.5,
      notes: null,
      discipline: null,
    },
    {
      id: "2",
      user_id: "u1",
      project_id: "p1",
      phase_id: "ph1",
      task_id: null,
      date: "2026-02-23",
      hours: 2,
      notes: null,
      discipline: "Design",
    },
  ] as any;

  it("computes row totals", () => {
    const projectTotal = getTotalHoursForRow(
      {
        id: "p1",
        type: "project",
        project_id: "p1",
        project_title: "P",
        client_name: "C",
        planned_hours: 0,
      } as any,
      entries
    );
    expect(projectTotal).toBe(1.5);
  });

  it("computes day and grand totals", () => {
    expect(getTotalHoursForDay(new Date("2026-02-23"), entries)).toBe(3.5);
    expect(getGrandTotal(entries)).toBe(3.5);
  });
});
