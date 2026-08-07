/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEffortLastResolved,
  getEffortResolvedFlash,
  publishEffortResolvedFlash,
  resetEffortResolvedFlashes,
} from "./effort-resolved-flash.js";

// The two lifetimes are the whole point of this store: the trigger highlight is
// transient, but "which tier is Auto running" is a standing fact the chooser
// shows on every open. A single TTL'd value cannot express both.
describe("effort resolved flash vs last-resolved", () => {
  afterEach(() => {
    vi.useRealTimers();
    resetEffortResolvedFlashes();
  });

  it("keeps the resolved tier after the flash TTL expires", () => {
    vi.useFakeTimers();
    publishEffortResolvedFlash("host-a", { effort: "low", modelId: "m-1" });

    expect(getEffortResolvedFlash("host-a")?.effort).toBe("low");
    expect(getEffortLastResolved("host-a")?.effort).toBe("low");

    vi.advanceTimersByTime(9000);

    expect(getEffortResolvedFlash("host-a")).toBeNull();
    expect(getEffortLastResolved("host-a")?.effort).toBe("low");
    expect(getEffortLastResolved("host-a")?.modelId).toBe("m-1");
  });

  it("overwrites the standing resolution on the next turn", () => {
    publishEffortResolvedFlash("host-a", { effort: "low" });
    publishEffortResolvedFlash("host-a", { effort: "high" });

    expect(getEffortLastResolved("host-a")?.effort).toBe("high");
  });

  it("keys hosts separately so drawer and full page do not stomp", () => {
    publishEffortResolvedFlash("host-a", { effort: "low" });
    publishEffortResolvedFlash("host-b", { effort: "high" });

    expect(getEffortLastResolved("host-a")?.effort).toBe("low");
    expect(getEffortLastResolved("host-b")?.effort).toBe("high");
  });
});
