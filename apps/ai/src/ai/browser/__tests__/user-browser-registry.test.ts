import { afterEach, describe, expect, it, vi } from "vitest";

// The registry only needs Mastra's class shape here; the real one drags in
// playwright-core and a CDP connection nobody has in a unit test.
vi.mock("@mastra/agent-browser", () => ({
  AgentBrowser: class {
    close = vi.fn(() => Promise.resolve());
    onBrowserClosed = vi.fn(() => () => undefined);
  },
}));

import {
  acquireAgentSeat,
  disarmProcessKill,
  getSeat,
  releaseAgentSeat,
  releaseUserSeat,
  resetUserBrowserRegistryForTests,
  subscribeSeat,
  takeUserSeat,
} from "../user-browser-registry.js";

const identity = {
  tenantId: "00000000-0000-4000-8000-0000000000aa",
  userId: "00000000-0000-4000-8000-0000000000cc",
};
const SANDBOX_ID = `engenty-browser-${identity.tenantId}-${identity.userId}`;

describe("user browser seat", () => {
  afterEach(() => {
    resetUserBrowserRegistryForTests();
  });

  it("an agent takes a free seat and keeps it across calls of the same run", () => {
    const first = acquireAgentSeat(identity, "run-1");
    expect(first.ok).toBe(true);
    expect(acquireAgentSeat(identity, "run-1").ok).toBe(true);
    expect(getSeat(SANDBOX_ID).holder).toEqual({ runId: "run-1" });
  });

  it("a second run is refused at once, never queued", () => {
    acquireAgentSeat(identity, "run-1");
    expect(acquireAgentSeat(identity, "run-2")).toEqual({
      error: "held_by_agent",
      ok: false,
    });
  });

  it("the human always wins: taking the seat interrupts the agent's step", async () => {
    const seat = acquireAgentSeat(identity, "run-1");
    if (!seat.ok) {
      throw new Error("seat expected");
    }
    let interrupted = false;
    const waiting = seat.interrupted.then(() => {
      interrupted = true;
    });
    takeUserSeat(SANDBOX_ID);
    await waiting;
    expect(interrupted).toBe(true);
    expect(getSeat(SANDBOX_ID).holder).toBe("user");
    expect(acquireAgentSeat(identity, "run-1")).toEqual({
      error: "held_by_user",
      ok: false,
    });
  });

  it("tells a live view every time the seat changes hands", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSeat(SANDBOX_ID, () => {
      const holder = getSeat(SANDBOX_ID).holder;
      seen.push(
        holder === null ? "free" : holder === "user" ? "user" : "agent"
      );
    });
    acquireAgentSeat(identity, "run-1");
    acquireAgentSeat(identity, "run-1");
    takeUserSeat(SANDBOX_ID);
    takeUserSeat(SANDBOX_ID);
    releaseUserSeat(SANDBOX_ID);
    unsubscribe();
    acquireAgentSeat(identity, "run-2");
    expect(seen).toEqual(["agent", "user", "free"]);
  });

  it("handing back frees the seat for the next agent call", () => {
    takeUserSeat(SANDBOX_ID);
    releaseUserSeat(SANDBOX_ID);
    expect(getSeat(SANDBOX_ID).holder).toBeNull();
    expect(acquireAgentSeat(identity, "run-3").ok).toBe(true);
  });

  it("a run's release does not touch a seat held by someone else", () => {
    acquireAgentSeat(identity, "run-1");
    releaseAgentSeat(SANDBOX_ID, "run-2");
    expect(getSeat(SANDBOX_ID).holder).toEqual({ runId: "run-1" });
    releaseAgentSeat(SANDBOX_ID, "run-1");
    expect(getSeat(SANDBOX_ID).holder).toBeNull();
  });
});

describe("disarmProcessKill", () => {
  // The exact shape Mastra's disconnect handler relies on: it remembers the
  // container's Chromium as PID 1 and would `process.kill(-1)` — the host's
  // entire session — unless both fields stay empty.
  it("keeps every remembered browser PID empty, however Mastra writes it", () => {
    const browser = disarmProcessKill({
      sharedBrowserPid: undefined as number | undefined,
      threadBrowserPids: new Map<string, number>(),
    });
    browser.sharedBrowserPid = 1;
    browser.threadBrowserPids.set("thread-a", 1);
    expect(browser.sharedBrowserPid).toBeUndefined();
    expect(browser.threadBrowserPids.get("thread-a")).toBeUndefined();
    expect(browser.threadBrowserPids.size).toBe(0);
  });

  it("never lets a kill reach the host", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const browser = disarmProcessKill({
      sharedBrowserPid: undefined as number | undefined,
    });
    browser.sharedBrowserPid = 1;
    // Mastra's helper, verbatim: a null/undefined pid returns before kill.
    const pid = browser.sharedBrowserPid;
    if (pid != null) {
      process.kill(-pid, "SIGKILL");
    }
    expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
  });
});
