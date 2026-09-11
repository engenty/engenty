import { AgentBrowser } from "@mastra/agent-browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { disarmProcessKill } from "../user-browser-registry.js";

// The real class, no container: what matters is the code path Mastra runs
// when a CDP-connected browser goes away. A PID that cannot exist keeps the
// control case harmless even if the spy were ever bypassed (ESRCH).
const IMPOSSIBLE_PID = 2_000_000_000;

interface Internals {
  handleBrowserDisconnected: () => void;
  sharedBrowserPid: number | undefined;
}

function make(): AgentBrowser & Internals {
  return new AgentBrowser({
    cdpUrl: "http://127.0.0.1:1",
    scope: "shared",
  }) as unknown as AgentBrowser & Internals;
}

describe("disarmProcessKill against Mastra's real disconnect handler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("control: an armed handle DOES signal the remembered process group", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const browser = make();
    browser.sharedBrowserPid = IMPOSSIBLE_PID;
    browser.handleBrowserDisconnected();
    expect(kill).toHaveBeenCalledWith(-IMPOSSIBLE_PID, "SIGKILL");
  });

  it("a disarmed handle never signals anything, whatever PID Mastra learned", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const browser = disarmProcessKill(make());
    // What Mastra writes after `SystemInfo.getProcessInfo` on our container.
    browser.sharedBrowserPid = 1;
    browser.handleBrowserDisconnected();
    expect(kill).not.toHaveBeenCalled();
  });
});
