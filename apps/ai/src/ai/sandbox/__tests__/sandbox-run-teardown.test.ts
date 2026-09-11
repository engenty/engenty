import { describe, expect, it, vi } from "vitest";

import type { EngentySandboxProvider } from "../sandbox-provider.js";
import { destroyRunSandboxes } from "../sandbox-run-teardown.js";

describe("destroyRunSandboxes", () => {
  function makeProvider(id: string): EngentySandboxProvider {
    return {
      destroy: vi.fn(async () => undefined),
      getWorkingDirectory: () => "/tmp",
      id,
      provider: "docker",
      runCommand: vi.fn(),
      syncIn: vi.fn(async () => undefined),
      // Promise-returning, like the real provider — the teardown awaits these.
      syncOut: vi.fn(async () => undefined),
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

  it("still persists the kept-alive parent's workspace", async () => {
    // Keeping the instance alive for a parked resume must not cost durability:
    // `destroy()` was what ran `syncOut`, so skipping it wholesale would leave
    // everything staged into /shared + /home before the suspend unsaved until
    // the resume — and lost outright if the process died while parked.
    const parent = makeProvider("parent");

    await destroyRunSandboxes({
      keepParentSandboxAlive: true,
      sandboxProvider: parent,
      subAgentSandboxProviders: [],
    });

    expect(parent.syncOut).toHaveBeenCalledOnce();
    expect(parent.destroy).not.toHaveBeenCalled();
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
