import { afterEach, describe, expect, it, vi } from "vitest";

// Docker is the only thing the sweep talks to: `inspect` answers when the
// container last started, `stop` is what the test watches for.
const docker = vi.hoisted(() => ({
  startedAt: "",
  stopped: [] as string[],
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    args: string[],
    callback: (
      err: Error | null,
      out: { stderr: string; stdout: string }
    ) => void
  ) => {
    if (args[0] === "inspect") {
      callback(null, { stderr: "", stdout: `${docker.startedAt}\n` });
    } else if (args[0] === "stop") {
      docker.stopped.push(args.at(-1) ?? "");
      callback(null, { stderr: "", stdout: "" });
    } else {
      callback(new Error(`unexpected docker ${args[0]}`), {
        stderr: "",
        stdout: "",
      });
    }
  },
}));

import {
  buildUserBrowserSandboxId,
  resetUserBrowserStateForTests,
  sweepIdleUserBrowsers,
} from "../space-browser.js";

const SANDBOX_ID = buildUserBrowserSandboxId({
  spaceId: "00000000-0000-4000-8000-0000000000bb",
  tenantId: "00000000-0000-4000-8000-0000000000aa",
});
const DAY_MS = 24 * 60 * 60 * 1000;
// Browsers are woken, not recreated: the container is days old.
const row = {
  container_id: "container-1",
  created_at_ms: Date.now() - 3 * DAY_MS,
  sandbox_id: SANDBOX_ID,
};

describe("sweepIdleUserBrowsers, for a browser this process has not seen used", () => {
  afterEach(() => {
    resetUserBrowserStateForTests();
    vi.useRealTimers();
    docker.stopped.length = 0;
  });

  it("leaves a browser woken a minute ago running, however old its container", async () => {
    vi.useFakeTimers({ now: Date.now() + DAY_MS, toFake: ["Date"] });
    docker.startedAt = new Date(Date.now() - 60_000).toISOString();
    expect(await sweepIdleUserBrowsers([row])).toBe(0);
    expect(docker.stopped).toEqual([]);
  });

  it("leaves a long-running browser alone right after apps/ai restarts", async () => {
    // Started a day ago, in use until the restart: this process has no
    // record of that use, and must not read the silence as idleness.
    docker.startedAt = new Date(Date.now() - DAY_MS).toISOString();
    expect(await sweepIdleUserBrowsers([row])).toBe(0);
    expect(docker.stopped).toEqual([]);
  });

  it("stops it once this process has run past the idle limit without a use", async () => {
    vi.useFakeTimers({ now: Date.now() + DAY_MS, toFake: ["Date"] });
    docker.startedAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
    expect(await sweepIdleUserBrowsers([row])).toBe(1);
    expect(docker.stopped).toEqual(["container-1"]);
  });
});
