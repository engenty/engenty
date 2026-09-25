import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SandboxExtraMount } from "../../sandbox/sandbox-types.js";

const created: Array<{ extraMounts?: SandboxExtraMount[] }> = [];

vi.mock("../../sandbox/sandbox-factory.js", () => ({
  createEngentySandboxProvider: vi.fn(
    (input: { extraMounts?: SandboxExtraMount[] }) => {
      created.push(input);
      return {
        mastraSandbox: undefined,
        provider: {
          destroy: async () => undefined,
          getWorkingDirectory: () => "/sandbox",
          id: "sandbox-test",
          provider: "docker",
          runCommand: async () => ({ exitCode: 0, stderr: "", stdout: "" }),
          syncIn: async () => undefined,
          syncOut: async () => undefined,
        },
      };
    }
  ),
}));

const { createEngentyAgentWorkspace } = await import("../loader.js");

// `/data` is filled as the run's principal, so its staged copy must never be
// bound into a container other people's runs share. Ways this can fail: the
// space computer binds `/data` (another person reads records they cannot
// see), or the fix over-reaches and a per-run sandbox loses its `/data`.
describe("/data bind", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "engenty-data-bind-"));
    process.env.ENGENTY_SPACES_DIR = join(root, "spaces");
    process.env.ENGENTY_WORKSPACE_FS = "local";
    created.length = 0;
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    delete process.env.ENGENTY_SPACES_DIR;
    delete process.env.ENGENTY_WORKSPACE_FS;
  });

  async function containerPathsFor(lifecycle: "run" | "space") {
    await createEngentyAgentWorkspace({
      agentConfig: {
        id: "agent-1",
        name: "Agent",
        tenantId: "tenant-1",
      },
      enableSandbox: true,
      // Unreachable on purpose: materialising fails and is swallowed, which
      // is fine — only the binds are under test.
      fileStorageAccess: {
        accessToken: "token",
        coreBaseUrl: "http://127.0.0.1:1",
      },
      mounts: [
        {
          fileStorageRelativePath: "ai/workspace/commons/",
          mountPath: "/space",
          spaceId: "space-1",
        },
        {
          fileStorageRelativePath: "data",
          kind: "data",
          mountPath: "/data",
          spaceId: "space-1",
        },
      ],
      sandboxConfig: { lifecycle },
      sandboxIdentity: {
        runId: "run-1",
        spaceId: "space-1",
        tenantId: "tenant-1",
        threadId: "thread-1",
      },
    });
    expect(created).toHaveLength(1);
    return (created[0]?.extraMounts ?? []).map((m) => m.containerPath);
  }

  it("a space computer does not bind /data", async () => {
    const paths = await containerPathsFor("space");
    expect(paths).not.toContain("/data");
    expect(paths).toContain("/space");
  });

  it("a per-run sandbox still binds its staged /data", async () => {
    expect(await containerPathsFor("run")).toContain("/data");
  });
});
