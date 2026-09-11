import { describe, expect, it } from "vitest";

import { resolveRunSandboxLifecycle } from "../agent-workspace-hook.js";

describe("resolveRunSandboxLifecycle", () => {
  it("routes a run-lifecycle sandbox onto the space computer", () => {
    expect(
      resolveRunSandboxLifecycle({
        declared: "run",
        spaceResolved: true,
      })
    ).toBe("space");
  });

  it("never routes without a resolved space — the machine is keyed by it", () => {
    expect(
      resolveRunSandboxLifecycle({
        declared: "run",
        spaceResolved: false,
      })
    ).toBe("run");
  });

  it("leaves session and task declarations alone — their continuity is their own", () => {
    // CLI and Copilot keep their per-conversation containers; a task-bound
    // run keeps the task checkout. Only plain run leases move to the machine.
    expect(
      resolveRunSandboxLifecycle({
        declared: "session",
        spaceResolved: true,
      })
    ).toBe("session");
    expect(
      resolveRunSandboxLifecycle({
        declared: "task",
        spaceResolved: true,
      })
    ).toBe("task");
  });
});
