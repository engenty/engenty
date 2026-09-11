import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSpaceComputerLastUsedMs,
  getSpaceComputerQueueDepths,
  isSpaceComputerSandboxId,
  markSpaceComputerUsed,
  resetSpaceComputerStateForTests,
  resolveSpaceComputerIdleStopMs,
  withSpaceComputerExecSerialization,
} from "../space-computer.js";

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const SPACE = "00000000-0000-4000-8000-0000000000bb";
const MACHINE_ID = `engenty-space-${TENANT}-${SPACE}`;

type ExecFn = (command: string) => Promise<string>;

function fakeSandbox(id: string, executeCommand: ExecFn) {
  return { executeCommand, id } as unknown as Parameters<
    typeof withSpaceComputerExecSerialization
  >[0];
}

describe("withSpaceComputerExecSerialization", () => {
  afterEach(() => {
    resetSpaceComputerStateForTests();
    vi.unstubAllEnvs();
  });

  it("leaves non-machine sandboxes untouched", () => {
    const exec: ExecFn = () => Promise.resolve("ok");
    const sandbox = fakeSandbox("engenty-run-abc", exec);
    expect(withSpaceComputerExecSerialization(sandbox)).toBe(sandbox);
    expect(sandbox.executeCommand).toBe(exec);
  });

  it("runs machine commands one at a time, in order", async () => {
    // Two concurrent runs share ONE container: unserialized commands would
    // interleave its /tmp and process state. The queue is keyed by sandbox id,
    // so it also serializes across INSTANCES — modelled here by wrapping two
    // separate objects with the same id.
    const order: string[] = [];
    let releaseFirst = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const slow = fakeSandbox(MACHINE_ID, async (command) => {
      order.push(`start-${command}`);
      await gate;
      order.push(`end-${command}`);
      return command;
    });
    const fast = fakeSandbox(MACHINE_ID, (command) => {
      order.push(`start-${command}`);
      order.push(`end-${command}`);
      return Promise.resolve(command);
    });
    withSpaceComputerExecSerialization(slow);
    withSpaceComputerExecSerialization(fast);

    const first = (slow.executeCommand as unknown as ExecFn)("a");
    const second = (fast.executeCommand as unknown as ExecFn)("b");
    // Give the second call every chance to jump the queue before releasing.
    await new Promise((resolve) => setImmediate(resolve));
    expect(order).toEqual(["start-a"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["start-a", "end-a", "start-b", "end-b"]);
  });

  it("keeps the queue alive after a failed command", async () => {
    const sandbox = fakeSandbox(MACHINE_ID, (command) =>
      command === "boom"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve(command)
    );
    withSpaceComputerExecSerialization(sandbox);
    await expect(
      (sandbox.executeCommand as unknown as ExecFn)("boom")
    ).rejects.toThrow("boom");
    await expect(
      (sandbox.executeCommand as unknown as ExecFn)("ok")
    ).resolves.toBe("ok");
  });

  it("exposes queue depth while commands wait, empty when idle", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sandbox = fakeSandbox(MACHINE_ID, () => gate.then(() => "ok"));
    withSpaceComputerExecSerialization(sandbox);
    const first = (sandbox.executeCommand as unknown as ExecFn)("a");
    const second = (sandbox.executeCommand as unknown as ExecFn)("b");
    expect(getSpaceComputerQueueDepths()).toEqual({ [MACHINE_ID]: 2 });
    release();
    await Promise.all([first, second]);
    // Settled queues disappear from the report instead of lingering at 0.
    await new Promise((resolve) => setImmediate(resolve));
    expect(getSpaceComputerQueueDepths()).toEqual({});
  });

  it("stamps last use for the idle sweep", async () => {
    const sandbox = fakeSandbox(MACHINE_ID, () => Promise.resolve("ok"));
    withSpaceComputerExecSerialization(sandbox);
    expect(getSpaceComputerLastUsedMs(MACHINE_ID)).toBeNull();
    await (sandbox.executeCommand as unknown as ExecFn)("touch");
    expect(getSpaceComputerLastUsedMs(MACHINE_ID)).not.toBeNull();
  });
});

describe("space computer knobs", () => {
  afterEach(() => {
    resetSpaceComputerStateForTests();
    vi.unstubAllEnvs();
  });

  it("recognises machine ids by prefix", () => {
    expect(isSpaceComputerSandboxId(MACHINE_ID)).toBe(true);
    expect(isSpaceComputerSandboxId("engenty-run-abc")).toBe(false);
  });

  it("reads the idle TTL from env with a default", () => {
    expect(resolveSpaceComputerIdleStopMs()).toBe(30 * 60 * 1000);
    vi.stubEnv("ENGENTY_SPACE_COMPUTER_IDLE_STOP_MS", "60000");
    expect(resolveSpaceComputerIdleStopMs()).toBe(60_000);
  });

  it("mark/get round-trips", () => {
    markSpaceComputerUsed(MACHINE_ID);
    expect(getSpaceComputerLastUsedMs(MACHINE_ID)).toBeGreaterThan(0);
  });
});
