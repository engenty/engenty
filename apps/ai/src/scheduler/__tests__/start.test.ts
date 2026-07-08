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

  it("keeps retrying indefinitely with a capped backoff while core stays unreachable", async () => {
    resolveSchedulerServiceScope.mockResolvedValue(resolutionFailed);
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(1);

    // Backoff grows 5s × attempt until it hits the 60s cap (attempt 12).
    for (let retry = 1; retry <= 12; retry++) {
      await vi.advanceTimersByTimeAsync(Math.min(5000 * retry, 60_000));
      expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(retry + 1);
    }

    // Well past the old 4-attempt bound: the next retry fires exactly 60s
    // later (capped — 65s uncapped), not never.
    await vi.advanceTimersByTimeAsync(59_999);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(13);
    resolveSchedulerServiceScope.mockResolvedValue({ ok: true, scope });
    await vi.advanceTimersByTimeAsync(1);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(14);
    expect(startWorkers).toHaveBeenCalledTimes(1);
  });

  it("disables permanently without retrying when core rejects the JWT with 401", async () => {
    resolveSchedulerServiceScope.mockResolvedValue({
      ...resolutionFailed,
      error: "agent_threads.unauthorized",
      status: 401,
    });
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    await vi.runAllTimersAsync();
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(1);
    expect(startWorkers).not.toHaveBeenCalled();
  });
});
