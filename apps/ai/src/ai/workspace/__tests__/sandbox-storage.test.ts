import { describe, expect, it } from "vitest";
import { resolveSandboxStorageLayout } from "../../sandbox/sandbox-storage-paths.js";
import { resolveSandboxStorageRelativePath } from "../workspace-presets.js";

describe("resolveSandboxStorageRelativePath", () => {
  it("uses run-scoped sandbox prefix by default", () => {
    expect(
      resolveSandboxStorageRelativePath("run", {
        agentId: "engenty.cli",
        runId: "run-1",
        threadId: "thread-1",
      })
    ).toBe("ai/sandboxes/run-run-1/workspace/");
  });

  it("scopes a session prefix by thread AND agent", () => {
    // Two agents in one conversation each get their own scratch: sharing the
    // dir would have two containers writing one staging path.
    expect(
      resolveSandboxStorageRelativePath("session", {
        agentId: "engenty.cli",
        runId: "run-1",
        threadId: "thread-abc",
      })
    ).toBe("ai/sandboxes/session-thread-abc-engenty.cli/workspace/");
    expect(
      resolveSandboxStorageRelativePath("session", {
        agentId: "engenty.copilot",
        runId: "run-1",
        threadId: "thread-abc",
      })
    ).toBe("ai/sandboxes/session-thread-abc-engenty.copilot/workspace/");
  });

  it("uses task checkout path for task lifecycle", () => {
    expect(
      resolveSandboxStorageRelativePath("task", {
        agentId: "engenty.cli",
        runId: "run-1",
        taskIdentifier: "ENG-142",
        threadId: "thread-1",
      })
    ).toBe("ai/workspace/tasks/ENG-142/");
  });
});

describe("resolveSandboxStorageLayout", () => {
  it("maps storage prefix to local staging path", () => {
    const layout = resolveSandboxStorageLayout({
      agentId: "engenty.cli",
      lifecycle: "run",
      runId: "abc",
      tenantId: "tenant-1",
      threadId: "thread-1",
    });
    expect(layout.fileStorageRelativePath).toBe(
      "ai/sandboxes/run-abc/workspace/"
    );
    expect(layout.stagingPath).toContain("tenant-1");
    expect(layout.stagingPath).toContain("ai/sandboxes/run-abc/workspace");
  });
});
