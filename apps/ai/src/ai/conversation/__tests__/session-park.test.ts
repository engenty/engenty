import { describe, expect, it, vi } from "vitest";
import {
  disposeParkedSessionRun,
  finishParkedResume,
  isParkedResumeInFlight,
  parkSessionRun,
  takeParkedSessionRun,
} from "../session-park.js";

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

  it("tracks an in-flight resume from take until re-park or finish", () => {
    parkSessionRun("run-4", {
      controller: fakeController(),
      mergedDefinitions: [],
      session: fakeSession(),
      threadId: "t",
    });
    expect(isParkedResumeInFlight("run-4")).toBe(false);
    takeParkedSessionRun("run-4");
    // A duplicate approval click landing now must be told a resume is running.
    expect(isParkedResumeInFlight("run-4")).toBe(true);
    // Re-parking (the continuation suspended again) completes the transition.
    parkSessionRun("run-4", {
      controller: fakeController(),
      mergedDefinitions: [],
      session: fakeSession(),
      threadId: "t",
    });
    expect(isParkedResumeInFlight("run-4")).toBe(false);

    takeParkedSessionRun("run-4");
    expect(isParkedResumeInFlight("run-4")).toBe(true);
    // A finished (or errored) resume also completes the transition.
    finishParkedResume("run-4");
    expect(isParkedResumeInFlight("run-4")).toBe(false);
  });

  it("carries the run's sandbox so the resume can keep using it", () => {
    // The parked Session's Workspace still holds this sandbox instance, so the
    // park — not the finished run — owns its teardown.
    const sandboxProvider = { destroy: vi.fn(async () => {}) } as never;
    parkSessionRun("run-5", {
      controller: fakeController(),
      mergedDefinitions: [],
      sandboxProvider,
      session: fakeSession(),
      threadId: "t",
    });
    expect(takeParkedSessionRun("run-5")?.sandboxProvider).toBe(
      sandboxProvider
    );
  });

  it("disposes the controller AND the sandbox together", async () => {
    // Releasing the controller alone would leak the docker container and skip
    // the provider's final syncOut.
    const controllerDestroy = vi.fn(async () => {});
    const sandboxDestroy = vi.fn(async () => {});
    await disposeParkedSessionRun({
      controller: { destroy: controllerDestroy } as never,
      sandboxProvider: { destroy: sandboxDestroy } as never,
    });
    expect(controllerDestroy).toHaveBeenCalledOnce();
    expect(sandboxDestroy).toHaveBeenCalledOnce();
  });

  it("disposes a park that never had a sandbox", async () => {
    const controllerDestroy = vi.fn(async () => {});
    await expect(
      disposeParkedSessionRun({
        controller: { destroy: controllerDestroy } as never,
      })
    ).resolves.toBeUndefined();
    expect(controllerDestroy).toHaveBeenCalledOnce();
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
