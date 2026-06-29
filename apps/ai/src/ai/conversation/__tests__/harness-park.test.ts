import { describe, expect, it, vi } from "vitest";
import { parkHarnessRun, takeParkedHarnessRun } from "../harness-park.js";

// A minimal Harness stand-in — the park map only stores it and calls destroy().
function fakeHarness() {
  return { destroy: vi.fn(async () => {}) } as never;
}

describe("harness park map", () => {
  it("parks then takes a Harness once (take is consuming)", () => {
    const h = fakeHarness();
    parkHarnessRun("run-1", h, "thread-1", []);
    const taken = takeParkedHarnessRun("run-1");
    expect(taken?.harness).toBe(h);
    expect(taken?.threadId).toBe("thread-1");
    // A second take returns nothing — it was consumed.
    expect(takeParkedHarnessRun("run-1")).toBeUndefined();
  });

  it("returns undefined for an unknown run id", () => {
    expect(takeParkedHarnessRun("nope")).toBeUndefined();
  });

  it("re-parking the same run id replaces the prior entry", () => {
    const a = fakeHarness();
    const b = fakeHarness();
    parkHarnessRun("run-2", a, "t", []);
    parkHarnessRun("run-2", b, "t", []); // second suspend in one turn
    const taken = takeParkedHarnessRun("run-2");
    expect(taken?.harness).toBe(b);
  });

  it("carries the merged frontend-tool definitions for a re-suspend", () => {
    const defs = [{ name: "get_user_city" }] as never;
    parkHarnessRun("run-3", fakeHarness(), "t", defs);
    expect(takeParkedHarnessRun("run-3")?.mergedDefinitions).toBe(defs);
  });
});
