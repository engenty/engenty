import type { Mastra } from "@mastra/core/mastra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startScheduler } from "../start.js";

const resolveSchedulerServiceScope = vi.hoisted(() => vi.fn());
const reconcileScheduler = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../service-invoker.js", () => ({
  createSchedulerOperationInvoker: () => vi.fn(),
  resolveSchedulerServiceScope,
}));
vi.mock("../heartbeat-sync.js", () => ({ reconcileScheduler }));

const scope = {
  isSuperAdmin: false,
  isTenantAdmin: true,
  tenantId: "tenant-1",
  tenantRole: "admin" as const,
  userAccessToken: "jwt",
  userId: "user-1",
};

const resolutionFailed = {
  error: "agent_threads.scopeResolutionFailed",
  ok: false as const,
  reason: "resolution_failed" as const,
  status: 503,
};

function fakeMastra() {
  const startWorkers = vi.fn(async () => {});
  return {
    mastra: { startWorkers } as unknown as Mastra,
    startWorkers,
  };
}

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveSchedulerServiceScope.mockReset();
    reconcileScheduler.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts workers immediately when the scope resolves first try", async () => {
    resolveSchedulerServiceScope.mockResolvedValue({ ok: true, scope });
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    expect(startWorkers).toHaveBeenCalledTimes(1);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(1);
  });

  it("disables permanently without retrying when the JWT env var is not set", async () => {
    resolveSchedulerServiceScope.mockResolvedValue({
      ok: false,
      reason: "jwt_missing",
    });
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    await vi.runAllTimersAsync();
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(1);
    expect(startWorkers).not.toHaveBeenCalled();
  });

  it("retries a failed resolution and comes online once core is reachable", async () => {
    resolveSchedulerServiceScope
      .mockResolvedValueOnce(resolutionFailed)
      .mockResolvedValueOnce(resolutionFailed)
      .mockResolvedValue({ ok: true, scope });
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    expect(startWorkers).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000); // retry 1 — still failing
    expect(startWorkers).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000); // retry 2 — core is up
    expect(startWorkers).toHaveBeenCalledTimes(1);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(3);
  });

  it("gives up after the bounded retries when core stays unreachable", async () => {
    resolveSchedulerServiceScope.mockResolvedValue(resolutionFailed);
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    await vi.runAllTimersAsync();
    // initial attempt + SCOPE_RETRIES deferred retries
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(4);
    expect(startWorkers).not.toHaveBeenCalled();
  });
});
