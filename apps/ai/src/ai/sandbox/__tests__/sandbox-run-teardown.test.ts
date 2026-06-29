import { describe, expect, it, vi } from "vitest";

import { buildSessionLifecycleSandboxId } from "../destroy-session-sandbox.js";
import type { EngentySandboxProvider } from "../sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox-run-teardown.js";

describe("buildSessionLifecycleSandboxId", () => {
  it("keys session sandboxes by parent thread id", () => {
    expect(buildSessionLifecycleSandboxId("thread-abc")).toBe(
      "engenty-session-thread-abc"
    );
  });
});

describe("destroyRunSandboxes", () => {
  function makeProvider(id: string): EngentySandboxProvider {
    return {
      destroy: vi.fn(async () => undefined),
      getWorkingDirectory: () => "/tmp",
      id,
      provider: "docker",
      runCommand: vi.fn(),
      syncIn: vi.fn(),
      syncOut: vi.fn(),
    };
  }

  it("always destroys sub-agent sandboxes even when parent sandbox is kept alive", async () => {
    const parent = makeProvider("parent");
    const cli = makeProvider("engenty-session-thread-1");

    await destroyRunSandboxes({
      keepParentSandboxAlive: true,
      sandboxProvider: parent,
      subAgentSandboxProviders: [cli],
    });

    expect(parent.destroy).not.toHaveBeenCalled();
    expect(cli.destroy).toHaveBeenCalledOnce();
  });

  it("destroys parent and sub-agent sandboxes on normal run completion", async () => {
    const parent = makeProvider("parent");
    const cli = makeProvider("engenty-session-thread-1");

    await destroyRunSandboxes({
      keepParentSandboxAlive: false,
      sandboxProvider: parent,
      subAgentSandboxProviders: [cli],
    });

    expect(parent.destroy).toHaveBeenCalledOnce();
    expect(cli.destroy).toHaveBeenCalledOnce();
  });
});
