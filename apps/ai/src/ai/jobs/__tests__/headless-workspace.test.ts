import { describe, expect, it, vi } from "vitest";

const buildAgentWorkspaceForRun = vi.fn();

vi.mock("../../sessions/agent-workspace-hook.js", () => ({
  buildAgentWorkspaceForRun: (
    input: Parameters<typeof buildAgentWorkspaceForRun>[0]
  ) => buildAgentWorkspaceForRun(input),
}));

const { buildHeadlessWorkspace } = await import("../headless-workspace.js");

const scope = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
} as never;

function registryWith(workspace: unknown) {
  return {
    getAgentConfig: vi.fn(async () =>
      workspace === undefined
        ? { id: "some.agent" }
        : { id: "some.agent", workspace }
    ),
  } as never;
}

function lastMounts(): { mountPath: string; spaceId?: string }[] {
  return buildAgentWorkspaceForRun.mock.calls.at(-1)?.[0]?.mounts ?? [];
}

describe("buildHeadlessWorkspace", () => {
  it("gives an agent with no declaration the staff archetype", async () => {
    buildAgentWorkspaceForRun.mockResolvedValue({ workspace: {} });
    // Every DB-registered agent (`agent_propose`) is in this case — without a
    // default they would run headless with no files at all.
    await buildHeadlessWorkspace({
      agentId: "some.agent",
      registry: registryWith(undefined),
      runId: "run-1",
      scope,
      threadId: "thread-1",
    });

    const paths = lastMounts().map((m) => m.mountPath);
    expect(paths).toContain("/home");
    expect(paths).toContain("/skills");
    expect(
      buildAgentWorkspaceForRun.mock.calls.at(-1)?.[0].workspaceConfig
    ).toMatchObject({ preset: "staff" });
  });

  it("honors an agent that opted out", async () => {
    buildAgentWorkspaceForRun.mockResolvedValue({ workspace: {} });
    await expect(
      buildHeadlessWorkspace({
        agentId: "some.agent",
        registry: registryWith({ enabled: false, preset: "staff" }),
        runId: "run-1",
        scope,
        threadId: "thread-1",
      })
    ).resolves.toBeUndefined();
  });

  it("roots a routine fire's mounts on the routine and its space", async () => {
    buildAgentWorkspaceForRun.mockResolvedValue({ workspace: {} });
    await buildHeadlessWorkspace({
      agentId: "some.agent",
      registry: registryWith({ enabled: true, preset: "staff" }),
      routineId: "routine-7",
      runId: "run-1",
      scope,
      spaceId: "space-9",
      threadId: "thread-1",
    });

    const byPath = new Map(lastMounts().map((m) => [m.mountPath, m]));
    // The point of the routine folder: successive fires read what the last one
    // wrote, which a per-run scratch could never give them.
    expect(byPath.get("/routine")?.spaceId).toBe("space-9");
    expect(byPath.get("/space")?.spaceId).toBe("space-9");
    // A fire is not a task, so the task checkout drops.
    expect(byPath.has("/task")).toBe(false);
  });

  it("mounts /task only for a task-bound run", async () => {
    buildAgentWorkspaceForRun.mockResolvedValue({ workspace: {} });
    await buildHeadlessWorkspace({
      agentId: "some.agent",
      registry: registryWith({ enabled: true, preset: "staff" }),
      runId: "run-1",
      scope,
      taskIdentifier: "ENG-4",
      threadId: "thread-1",
    });

    expect(lastMounts().map((m) => m.mountPath)).toContain("/task");
  });

  it("carries the registry's Worker sandbox into a headless run", async () => {
    buildAgentWorkspaceForRun.mockResolvedValue({ workspace: {} });
    // The registry read seam applies the Worker default before this function
    // ever sees the config (composite-ai-registry); headless must pass it
    // through unchanged so a routine fire executes exactly like chat.
    await buildHeadlessWorkspace({
      agentId: "inbox.assist",
      registry: registryWith({
        enabled: true,
        preset: "staff",
        sandbox: {
          enabled: true,
          lifecycle: "run",
          mountPath: "/sandbox",
          network: "none",
          requireApproval: true,
        },
      }),
      runId: "run-1",
      scope,
      threadId: "thread-1",
    });
    expect(
      buildAgentWorkspaceForRun.mock.calls.at(-1)?.[0].workspaceConfig.sandbox
    ).toMatchObject({ enabled: true, lifecycle: "run", requireApproval: true });
  });
});
