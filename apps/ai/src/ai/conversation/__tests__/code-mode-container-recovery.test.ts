import { FRAME_PREFIX } from "@mastra/core/tools";
import { describe, expect, it, vi } from "vitest";
import {
  DockerCodeModeTransport,
  isMissingContainerError,
} from "../../../../ai/tools/engenty-tools/code-mode-docker-transport.js";

/**
 * Minimal sandbox stand-in: reports itself as running (the stale-cache case)
 * and fails the first spawn with Docker's vanished-container error.
 */
function makeSandbox(options: {
  failFirstSpawn: boolean;
  hostDir: string;
  status?: string;
}) {
  const spawns: number[] = [];
  const start = vi.fn(async () => {
    // A real start() would recreate the container.
  });
  let spawnCount = 0;

  const sandbox = {
    _volumes: { [options.hostDir]: "/workspace" },
    _workingDir: "/workspace",
    processes: {
      spawn: async (
        _command: string,
        spawnOptions: { onStdout?: (chunk: string) => void }
      ) => {
        spawnCount += 1;
        spawns.push(spawnCount);
        if (options.failFirstSpawn && spawnCount === 1) {
          throw new Error("(HTTP code 404) no such container - abc123");
        }
        // Emit a terminal frame so run() resolves immediately. This must be a
        // MACROTASK: the transport installs its frame handler synchronously
        // after `await spawn(...)` resolves, so a microtask would fire while
        // that handler is still in its temporal dead zone and the frame would
        // be swallowed by the malformed-frame catch. Real stdout arrives as an
        // I/O event, which is always a macrotask.
        setTimeout(() => {
          spawnOptions.onStdout?.(
            `${FRAME_PREFIX}${JSON.stringify({
              ok: true,
              result: { rows: 2 },
              type: "done",
            })}\n`
          );
        });
        return {
          kill: async () => undefined,
          sendStdin: async () => undefined,
          wait: () => new Promise<void>(() => undefined),
        };
      },
    },
    start,
    status: options.status ?? "running",
  };

  return { sandbox, spawns, start };
}

async function runTransport(sandbox: unknown) {
  const transport = new DockerCodeModeTransport();
  return transport.run({
    dispatch: async () => ({}),
    program: "export default async function () { return { rows: 2 }; }",
    sandbox: sandbox as never,
    timeout: 5000,
    toolIds: ["engenty_tools_search"],
  });
}

describe("isMissingContainerError", () => {
  it("recognises Docker's vanished-container error", () => {
    expect(
      isMissingContainerError(
        new Error("(HTTP code 404) no such container - abc123")
      )
    ).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingContainerError(new Error("bun: command not found"))).toBe(
      false
    );
    expect(isMissingContainerError(new Error("connection refused"))).toBe(
      false
    );
  });
});

describe("DockerCodeModeTransport container recovery", () => {
  it("restarts and retries when a cached-running container is gone", async () => {
    const dir = "/tmp/claude-501/code-mode-recovery-a";
    const { sandbox, spawns, start } = makeSandbox({
      failFirstSpawn: true,
      hostDir: dir,
    });

    const result = await runTransport(sandbox);

    // The pre-flight guard skipped start() because status said "running";
    // recovery is what makes the run succeed.
    expect(start).toHaveBeenCalledTimes(1);
    expect(spawns).toHaveLength(2);
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ rows: 2 });
  });

  it("does not retry when the container is healthy", async () => {
    const dir = "/tmp/claude-501/code-mode-recovery-b";
    const { sandbox, spawns, start } = makeSandbox({
      failFirstSpawn: false,
      hostDir: dir,
    });

    const result = await runTransport(sandbox);

    expect(start).not.toHaveBeenCalled();
    expect(spawns).toHaveLength(1);
    expect(result.success).toBe(true);
  });

  it("still starts a stopped sandbox before the first spawn", async () => {
    const dir = "/tmp/claude-501/code-mode-recovery-c";
    const { sandbox, spawns, start } = makeSandbox({
      failFirstSpawn: false,
      hostDir: dir,
      status: "stopped",
    });

    await runTransport(sandbox);

    expect(start).toHaveBeenCalledTimes(1);
    expect(spawns).toHaveLength(1);
  });
});
