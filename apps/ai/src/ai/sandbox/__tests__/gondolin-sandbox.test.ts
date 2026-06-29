import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mocked Gondolin module: a fake VM whose `exec` is controllable per test and a
// `RealFSProvider` that just records its root path. Keeps the suite hermetic —
// no QEMU/krun, no virtualization.
const execMock = vi.fn();
const closeMock = vi.fn().mockResolvedValue(undefined);
const createMock = vi.fn();

vi.mock("@earendil-works/gondolin", () => {
  class RealFSProvider {
    readonly rootPath: string;
    constructor(rootPath: string) {
      this.rootPath = rootPath;
    }
  }
  class VM {
    static create = createMock;
    exec = execMock;
    close = closeMock;
  }
  return { RealFSProvider, VM };
});

import { GondolinSandbox } from "../providers/gondolin-sandbox.js";

function makeSandbox() {
  return new GondolinSandbox({
    backend: "qemu",
    id: "engenty-run-abc",
    mountPath: "/sandbox",
    stagingPath: "/tmp/staging",
    timeoutMs: 60_000,
  });
}

describe("GondolinSandbox.executeCommand", () => {
  beforeEach(() => {
    createMock.mockResolvedValue({ exec: execMock, close: closeMock });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("boots the VM once and maps a successful exec to CommandResult", async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: "hi\n", stderr: "" });
    const sandbox = makeSandbox();

    const result = await sandbox.executeCommand("echo hi");

    expect(createMock).toHaveBeenCalledTimes(1);
    // VFS mount maps the agent mount path -> host staging dir.
    const vmOptions = createMock.mock.calls[0][0];
    expect(vmOptions.sandbox).toEqual({ vmm: "qemu" });
    expect(vmOptions.vfs.mounts["/sandbox"].rootPath).toBe("/tmp/staging");
    // Mirrors Docker: runs via `/bin/sh -c`.
    expect(execMock).toHaveBeenCalledWith(
      ["/bin/sh", "-c", "echo hi"],
      expect.objectContaining({ stdout: "buffer", stderr: "buffer" })
    );
    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "hi\n",
      stderr: "",
      success: true,
    });

    // Second command reuses the same VM (no re-create).
    await sandbox.executeCommand("echo again");
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("folds args into the shell string like DockerSandbox", async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const sandbox = makeSandbox();

    await sandbox.executeCommand("ls", ["-la", "/sandbox"]);

    expect(execMock).toHaveBeenCalledWith(
      ["/bin/sh", "-c", "ls -la /sandbox"],
      expect.anything()
    );
  });

  it("drops undefined env values and forwards cwd", async () => {
    execMock.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
    const sandbox = makeSandbox();

    await sandbox.executeCommand("env", undefined, {
      cwd: "/sandbox/data",
      env: { KEEP: "1", DROP: undefined },
    });

    const opts = execMock.mock.calls[0][1];
    expect(opts.cwd).toBe("/sandbox/data");
    expect(opts.env).toEqual({ KEEP: "1" });
  });

  it("maps a non-zero exit to success=false", async () => {
    execMock.mockResolvedValue({ exitCode: 2, stdout: "", stderr: "boom" });
    const sandbox = makeSandbox();

    const result = await sandbox.executeCommand("false");

    expect(result.exitCode).toBe(2);
    expect(result.success).toBe(false);
    expect(result.stderr).toBe("boom");
  });

  it("reports timedOut when the per-command timeout fires", async () => {
    // exec rejects when its signal aborts (Gondolin surfaces abort as rejection).
    execMock.mockImplementation(
      (_cmd, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );
    const sandbox = makeSandbox();

    const result = await sandbox.executeCommand("sleep 999", undefined, {
      timeout: 5,
    });

    expect(result.timedOut).toBe(true);
    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(124);
  });

  it("truncates output to maxRetainedBytes keeping the newest bytes", async () => {
    execMock.mockResolvedValue({
      exitCode: 0,
      stdout: "0123456789",
      stderr: "",
    });
    const sandbox = makeSandbox();

    const result = await sandbox.executeCommand("cat big", undefined, {
      maxRetainedBytes: 4,
    });

    expect(result.stdout).toBe("6789");
    expect(result.stdoutTruncated).toBe(true);
  });
});
