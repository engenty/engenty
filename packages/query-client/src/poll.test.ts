import { describe, expect, it } from "vitest";
import {
  keepPollingWhenHidden,
  POLL_STAGGER_RATIO,
  staggeredRefetchInterval,
  staggerPollMs,
} from "./poll.js";

describe("staggerPollMs", () => {
  it("never shortens the base interval", () => {
    expect(staggerPollMs(30_000, "space-home")).toBeGreaterThanOrEqual(30_000);
    expect(staggerPollMs(5000, "agent-live-activity")).toBeGreaterThanOrEqual(
      5000
    );
  });

  it("stays within the stagger window", () => {
    const span = Math.round(30_000 * POLL_STAGGER_RATIO);
    const next = staggerPollMs(30_000, "notifications-list");
    expect(next).toBeLessThan(30_000 + span);
  });

  it("is stable for a given salt", () => {
    expect(staggerPollMs(15_000, "space-conversations")).toBe(
      staggerPollMs(15_000, "space-conversations")
    );
  });

  it("offsets overlapping 30s polls away from each other", () => {
    expect(staggerPollMs(30_000, "space-home")).not.toBe(
      staggerPollMs(30_000, "notifications-list")
    );
    expect(staggerPollMs(5000, "space-home")).not.toBe(
      staggerPollMs(5000, "agent-live-activity")
    );
  });
});

describe("staggeredRefetchInterval", () => {
  it("keeps polling off", () => {
    expect(staggeredRefetchInterval(false, "space-home")).toBe(false);
  });

  it("staggers a live interval", () => {
    expect(staggeredRefetchInterval(5000, "space-home")).toBe(
      staggerPollMs(5000, "space-home")
    );
  });
});

describe("keepPollingWhenHidden", () => {
  it("is off in the browser so a hidden tab can idle", () => {
    expect(keepPollingWhenHidden()).toBe(false);
  });
});
