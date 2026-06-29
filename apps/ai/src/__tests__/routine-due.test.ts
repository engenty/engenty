import type { RoutineDefinition } from "@engenty/ai-core";
import { describe, expect, it } from "vitest";
import { isRoutineDue, isWithinQuietHours } from "../routines/due.js";

function makeRoutine(
  overrides: Partial<RoutineDefinition> = {}
): RoutineDefinition {
  return {
    enabled_by_default: true,
    id: "demo.hourly",
    module_id: "demo",
    name: "Demo hourly",
    quiet_hours: null,
    schedule: "0 * * * *",
    target: {
      kind: "task_template",
      task_template: { agent_type_key: "demo.agent", title: "Demo" },
    },
    ...overrides,
  };
}

const NOW = new Date("2026-06-11T10:30:00Z");

describe("isWithinQuietHours", () => {
  it("handles a plain window", () => {
    expect(isWithinQuietHours("09:00-11:00", NOW)).toBe(true);
    expect(isWithinQuietHours("11:00-12:00", NOW)).toBe(false);
  });

  it("handles a midnight-wrapping window", () => {
    expect(
      isWithinQuietHours("22:00-06:00", new Date("2026-06-11T23:30:00Z"))
    ).toBe(true);
    expect(
      isWithinQuietHours("22:00-06:00", new Date("2026-06-11T05:59:00Z"))
    ).toBe(true);
    expect(isWithinQuietHours("22:00-06:00", NOW)).toBe(false);
  });
});

describe("isRoutineDue", () => {
  it("is due when never run", () => {
    expect(isRoutineDue(makeRoutine(), null, NOW)).toBe(true);
  });

  it("is due when the last run predates the last scheduled occurrence", () => {
    const state = {
      enabled: true,
      last_run_at: "2026-06-11T09:00:05Z", // ran for the 09:00 slot
      schedule_override: null,
    };
    expect(isRoutineDue(makeRoutine(), state, NOW)).toBe(true);
  });

  it("is not due when already run for the current slot", () => {
    const state = {
      enabled: true,
      last_run_at: "2026-06-11T10:00:05Z",
      schedule_override: null,
    };
    expect(isRoutineDue(makeRoutine(), state, NOW)).toBe(false);
  });

  it("respects enabled=false state over enabled_by_default", () => {
    const state = {
      enabled: false,
      last_run_at: null,
      schedule_override: null,
    };
    expect(isRoutineDue(makeRoutine(), state, NOW)).toBe(false);
  });

  it("respects enabled_by_default=false with no state row", () => {
    expect(
      isRoutineDue(makeRoutine({ enabled_by_default: false }), null, NOW)
    ).toBe(false);
  });

  it("uses the tenant schedule override", () => {
    // At 10:30:00 sharp the most recent */15 occurrence (exclusive) is 10:15.
    const state = {
      enabled: true,
      last_run_at: "2026-06-11T10:14:00Z", // before the 10:15 slot
      schedule_override: "*/15 * * * *",
    };
    expect(isRoutineDue(makeRoutine(), state, NOW)).toBe(true);
    const ranForSlot = { ...state, last_run_at: "2026-06-11T10:15:00.001Z" };
    expect(isRoutineDue(makeRoutine(), ranForSlot, NOW)).toBe(false);
  });

  it("never fires inside quiet hours", () => {
    expect(
      isRoutineDue(makeRoutine({ quiet_hours: "10:00-11:00" }), null, NOW)
    ).toBe(false);
  });

  it("treats an invalid cron override as not due instead of throwing", () => {
    const state = {
      enabled: true,
      last_run_at: null,
      schedule_override: "not a cron",
    };
    expect(isRoutineDue(makeRoutine(), state, NOW)).toBe(false);
  });
});
