import { describe, expect, it, vi } from "vitest";
import { parkSessionRun, takeParkedSessionRun } from "../session-park.js";

// Minimal controller/session stand-ins — the park map only stores them and
// calls controller.destroy().
function fakeController() {
  return { destroy: vi.fn(async () => {}) } as never;
}
function fakeSession() {
  return { respondToToolSuspension: vi.fn() } as never;
}

describe("session park map", () => {
  it("parks then takes a session once (take is consuming)", () => {
    const controller = fakeController();
    const session = fakeSession();
    parkSessionRun("run-1", {
      controller,
      mergedDefinitions: [],
      session,
      threadId: "thread-1",
    });
    const taken = takeParkedSessionRun("run-1");
    expect(taken?.controller).toBe(controller);
    expect(taken?.session).toBe(session);
    expect(taken?.threadId).toBe("thread-1");
    // A second take returns nothing — it was consumed.
    expect(takeParkedSessionRun("run-1")).toBeUndefined();
  });

  it("returns undefined for an unknown run id", () => {
    expect(takeParkedSessionRun("nope")).toBeUndefined();
  });

  it("re-parking the same run id replaces the prior entry", () => {
    const a = fakeSession();
    const b = fakeSession();
    parkSessionRun("run-2", {
      controller: fakeController(),
      mergedDefinitions: [],
      session: a,
      threadId: "t",
    });
    // second suspend in one turn
    parkSessionRun("run-2", {
      controller: fakeController(),
      mergedDefinitions: [],
      session: b,
      threadId: "t",
    });
    const taken = takeParkedSessionRun("run-2");
    expect(taken?.session).toBe(b);
  });

  it("carries the merged frontend-tool definitions for a re-suspend", () => {
    const defs = [{ name: "get_user_city" }] as never;
    parkSessionRun("run-3", {
      controller: fakeController(),
      mergedDefinitions: defs,
      session: fakeSession(),
      threadId: "t",
    });
    expect(takeParkedSessionRun("run-3")?.mergedDefinitions).toBe(defs);
  });
});
