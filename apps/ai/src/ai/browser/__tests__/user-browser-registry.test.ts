import { afterEach, describe, expect, it, vi } from "vitest";

// The registry only needs Mastra's class shape here; the real one drags in
// playwright-core and a CDP connection nobody has in a unit test.
vi.mock("@mastra/agent-browser", () => ({
  AgentBrowser: class {
    close = vi.fn(() => Promise.resolve());
    ensureReady = vi.fn(() => Promise.resolve());
    onBrowserClosed = vi.fn(() => () => undefined);
    sharedManager = { newTab: vi.fn(() => Promise.resolve()) };
  },
}));

import {
  acquireAgentSeat,
  browserWindowKey,
  closeUserBrowserSession,
  disarmProcessKill,
  ensureBrowserWindow,
  getSeat,
  getUserBrowser,
  peekUserBrowser,
  releaseAgentSeat,
  releaseUserSeat,
  resetUserBrowserRegistryForTests,
  subscribeSeat,
  takeUserSeat,
} from "../user-browser-registry.js";

const TENANT_ID = "00000000-0000-4000-8000-0000000000aa";
const SPACE_ID = "00000000-0000-4000-8000-0000000000bb";
const OTHER_SPACE_ID = "00000000-0000-4000-8000-0000000000dd";
const identity = { agentId: "agent-a", spaceId: SPACE_ID, tenantId: TENANT_ID };
const otherAgent = { ...identity, agentId: "agent-b" };
const SANDBOX_ID = `engenty-browser-${TENANT_ID}-${SPACE_ID}`;
const WINDOW_KEY = `${SANDBOX_ID}#agent-a`;
const OTHER_WINDOW_KEY = `${SANDBOX_ID}#agent-b`;

describe("user browser seat", () => {
  afterEach(() => {
    resetUserBrowserRegistryForTests();
  });

  it("an agent takes a free seat and keeps it across calls of the same run", () => {
    const first = acquireAgentSeat(identity, "run-1");
    expect(first.ok).toBe(true);
    expect(acquireAgentSeat(identity, "run-1").ok).toBe(true);
    expect(getSeat(WINDOW_KEY).holder).toEqual({ runId: "run-1" });
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
    takeUserSeat(WINDOW_KEY);
    await waiting;
    expect(interrupted).toBe(true);
    expect(getSeat(WINDOW_KEY).holder).toBe("user");
    expect(acquireAgentSeat(identity, "run-1")).toEqual({
      error: "held_by_user",
      ok: false,
    });
  });

  it("tells a live view every time the seat changes hands", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeSeat(WINDOW_KEY, () => {
      const holder = getSeat(WINDOW_KEY).holder;
      seen.push(
        holder === null ? "free" : holder === "user" ? "user" : "agent"
      );
    });
    acquireAgentSeat(identity, "run-1");
    acquireAgentSeat(identity, "run-1");
    takeUserSeat(WINDOW_KEY);
    takeUserSeat(WINDOW_KEY);
    releaseUserSeat(WINDOW_KEY);
    unsubscribe();
    acquireAgentSeat(identity, "run-2");
    expect(seen).toEqual(["agent", "user", "free"]);
  });

  it("handing back frees the seat for the next agent call", () => {
    takeUserSeat(WINDOW_KEY);
    releaseUserSeat(WINDOW_KEY);
    expect(getSeat(WINDOW_KEY).holder).toBeNull();
    expect(acquireAgentSeat(identity, "run-3").ok).toBe(true);
  });

  it("a run's release does not touch a seat held by someone else", () => {
    acquireAgentSeat(identity, "run-1");
    releaseAgentSeat(WINDOW_KEY, "run-2");
    expect(getSeat(WINDOW_KEY).holder).toEqual({ runId: "run-1" });
    releaseAgentSeat(WINDOW_KEY, "run-1");
    expect(getSeat(WINDOW_KEY).holder).toBeNull();
  });
});

describe("browser windows in one Space", () => {
  afterEach(() => {
    resetUserBrowserRegistryForTests();
  });

  it("keys each agent's window by sandbox and agent", () => {
    expect(browserWindowKey(identity)).toBe(WINDOW_KEY);
    expect(browserWindowKey(otherAgent)).toBe(OTHER_WINDOW_KEY);
  });

  it("gives two agents in one Space their own seats", () => {
    expect(acquireAgentSeat(identity, "run-1").ok).toBe(true);
    // Same Space browser, different window: not held_by_agent.
    expect(acquireAgentSeat(otherAgent, "run-2").ok).toBe(true);
    expect(getSeat(WINDOW_KEY).holder).toEqual({ runId: "run-1" });
    expect(getSeat(OTHER_WINDOW_KEY).holder).toEqual({ runId: "run-2" });
  });

  it("a human taking one agent's window leaves the other agent's alone", async () => {
    const a = acquireAgentSeat(identity, "run-1");
    const b = acquireAgentSeat(otherAgent, "run-2");
    if (!(a.ok && b.ok)) {
      throw new Error("seats expected");
    }
    let bInterrupted = false;
    b.interrupted.then(() => {
      bInterrupted = true;
    });
    const seenB: unknown[] = [];
    subscribeSeat(OTHER_WINDOW_KEY, () =>
      seenB.push(getSeat(OTHER_WINDOW_KEY).holder)
    );
    takeUserSeat(WINDOW_KEY);
    await a.interrupted;
    await Promise.resolve();
    expect(getSeat(WINDOW_KEY).holder).toBe("user");
    expect(getSeat(OTHER_WINDOW_KEY).holder).toEqual({ runId: "run-2" });
    expect(bInterrupted).toBe(false);
    expect(seenB).toEqual([]);
    expect(acquireAgentSeat(otherAgent, "run-2").ok).toBe(true);
  });

  it("gives each agent its own browser handle and opens its own tab once", async () => {
    const a = getUserBrowser(identity);
    const b = getUserBrowser(otherAgent);
    expect(a).not.toBe(b);
    expect(getUserBrowser(identity)).toBe(a);
    await ensureBrowserWindow(identity);
    await ensureBrowserWindow(identity);
    const manager = (
      a as unknown as {
        sharedManager: { newTab: ReturnType<typeof vi.fn> };
      }
    ).sharedManager;
    expect(manager.newTab).toHaveBeenCalledTimes(1);
  });

  it("closeUserBrowserSession closes every window of that sandbox only", async () => {
    const a = getUserBrowser(identity);
    const b = getUserBrowser(otherAgent);
    const elsewhere = { ...identity, spaceId: OTHER_SPACE_ID };
    const c = getUserBrowser(elsewhere);
    acquireAgentSeat(identity, "run-1");
    takeUserSeat(OTHER_WINDOW_KEY);
    acquireAgentSeat(elsewhere, "run-3");

    await closeUserBrowserSession(SANDBOX_ID);

    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(c.close).not.toHaveBeenCalled();
    expect(peekUserBrowser(WINDOW_KEY)).toBeNull();
    expect(peekUserBrowser(OTHER_WINDOW_KEY)).toBeNull();
    expect(getSeat(WINDOW_KEY).holder).toBeNull();
    expect(getSeat(OTHER_WINDOW_KEY).holder).toBeNull();
    const elsewhereKey = browserWindowKey(elsewhere);
    expect(peekUserBrowser(elsewhereKey)).toBe(c);
    expect(getSeat(elsewhereKey).holder).toEqual({ runId: "run-3" });
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
