import type { Mastra } from "@mastra/core/mastra";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import { startScheduler } from "../start.js";

const resolveSchedulerServiceScope = vi.hoisted(() => vi.fn());
const reconcileScheduler = vi.hoisted(() =>
  vi.fn(async (_params?: { tenantId: string }) => {})
);
const getServiceAccessToken = vi.hoisted(() => vi.fn());
const listTenantIds = vi.hoisted(() => vi.fn());

const logSpies = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@engenty/telemetry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@engenty/telemetry")>()),
  createLogger: () => logSpies,
}));

vi.mock("../service-invoker.js", () => ({
  createSchedulerOperationInvoker: () => vi.fn(),
  resolveSchedulerServiceScope,
}));
vi.mock("../heartbeat-sync.js", () => ({ reconcileScheduler }));
vi.mock("../../ai/service-credential.js", () => ({ getServiceAccessToken }));
vi.mock("../tenants.js", () => ({ listTenantIds }));

const scope = {
  isSuperAdmin: false,
  isTenantAdmin: true,
  tenantId: "tenant-1",
  tenantRole: "admin" as const,
  accessToken: "jwt",
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

const errorSpy = logSpies.error;

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resolveSchedulerServiceScope.mockReset();
    reconcileScheduler.mockReset();
    getServiceAccessToken.mockReset();
    getServiceAccessToken.mockResolvedValue("service-token");
    listTenantIds.mockReset();
    listTenantIds.mockResolvedValue(["tenant-1"]);
    errorSpy.mockReset();
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
    // Each failing attempt resolves twice: the tenant probe, then the
    // tenant-less fallback for a tenant-bound credential.
    resolveSchedulerServiceScope
      .mockResolvedValueOnce(resolutionFailed)
      .mockResolvedValueOnce(resolutionFailed)
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
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(5);
  });

  it("keeps retrying indefinitely with a capped backoff while core stays unreachable", async () => {
    // A failing attempt makes two resolve calls (tenant probe + tenant-less
    // fallback); a succeeding one makes just the probe.
    resolveSchedulerServiceScope.mockResolvedValue(resolutionFailed);
    const { mastra, startWorkers } = fakeMastra();
    await startScheduler({ mastra });
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(2);

    // Backoff grows 5s × attempt until it hits the 60s cap (attempt 12).
    for (let retry = 1; retry <= 12; retry++) {
      await vi.advanceTimersByTimeAsync(Math.min(5000 * retry, 60_000));
      expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(
        2 * (retry + 1)
      );
    }

    // Well past the old 4-attempt bound: the next retry fires exactly 60s
    // later (capped — 65s uncapped), not never.
    await vi.advanceTimersByTimeAsync(59_999);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(26);
    resolveSchedulerServiceScope.mockResolvedValue({ ok: true, scope });
    await vi.advanceTimersByTimeAsync(1);
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(27);
    expect(startWorkers).toHaveBeenCalledTimes(1);
  });

  it("reconciles inside the Engenty-tools ALS so the capability loader has a bearer", async () => {
    // The loader reads its token from the ALS, which only the HTTP middleware
    // normally enters. Without this the boot reconcile threw "…does not include
    // an end-user bearer token" and no trigger ever got its schedule.
    resolveSchedulerServiceScope.mockResolvedValue({ ok: true, scope });
    let seen: ReturnType<typeof getEngentyToolsRunContext> | null = null;
    reconcileScheduler.mockImplementation(async () => {
      seen = getEngentyToolsRunContext();
    });
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.advanceTimersByTimeAsync(5000);

    expect(reconcileScheduler).toHaveBeenCalledTimes(1);
    expect(seen).toEqual({
      tenantId: "tenant-1",
      accessToken: "service-token",
      userId: "user-1",
    });
  });

  it("retries the reconcile and re-vends the token on each attempt", async () => {
    // A token minted at scope resolution could be minutes stale by the last
    // retry; getServiceAccessToken caches and renews, so ask it every time.
    resolveSchedulerServiceScope.mockResolvedValue({ ok: true, scope });
    reconcileScheduler.mockRejectedValue(new Error("core unreachable"));
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.runAllTimersAsync();

    expect(reconcileScheduler).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(getServiceAccessToken).toHaveBeenCalledTimes(4);
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
    // Probe + tenant-less fallback, then disabled — no retry loop.
    expect(resolveSchedulerServiceScope).toHaveBeenCalledTimes(2);
    expect(startWorkers).not.toHaveBeenCalled();
  });

  it("reconciles every tenant, minting a per-tenant scope for each", async () => {
    // Platform-scoped credential: the scheduler serves all tenants, not the
    // credential's own — each reconcile enters the ALS with that tenant's
    // scope and passes that tenant's id down.
    listTenantIds.mockResolvedValue(["tenant-1", "tenant-2"]);
    const scope2 = { ...scope, tenantId: "tenant-2" };
    resolveSchedulerServiceScope.mockImplementation(
      async (tenantId?: string) => ({
        ok: true,
        scope: tenantId === "tenant-2" ? scope2 : scope,
      })
    );
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.runAllTimersAsync();

    expect(reconcileScheduler).toHaveBeenCalledTimes(2);
    const tenants = reconcileScheduler.mock.calls.map(
      (call) => (call[0] as { tenantId: string }).tenantId
    );
    expect(tenants.sort()).toEqual(["tenant-1", "tenant-2"]);
  });

  it("skips a tenant whose scope cannot be resolved instead of dying", async () => {
    // A tenant-bound credential in a multi-tenant install: foreign tenants
    // are refused at the exchange; their reconcile is skipped, the
    // credential's own tenant still comes online.
    listTenantIds.mockResolvedValue(["tenant-1", "tenant-2"]);
    resolveSchedulerServiceScope.mockImplementation(
      async (tenantId?: string) =>
        tenantId === "tenant-2"
          ? { ...resolutionFailed, status: 403 }
          : { ok: true, scope }
    );
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.runAllTimersAsync();

    expect(reconcileScheduler).toHaveBeenCalledTimes(1);
    expect(
      (reconcileScheduler.mock.calls[0]?.[0] as { tenantId: string }).tenantId
    ).toBe("tenant-1");
  });

  it("reports serving a partial platform at error level, naming the skipped tenants", async () => {
    // The per-tenant warns scroll away; a platform silently serving a SUBSET
    // of its tenants must be loud, since the skipped tenants' triggers and
    // system jobs never fire.
    listTenantIds.mockResolvedValue(["tenant-1", "tenant-2", "tenant-3"]);
    resolveSchedulerServiceScope.mockImplementation(
      async (tenantId?: string) =>
        tenantId === "tenant-1"
          ? { ok: true, scope }
          : { ...resolutionFailed, status: 403 }
    );
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.runAllTimersAsync();

    const lastError = errorSpy.mock.calls.at(-1) as
      | [string, Record<string, unknown>]
      | undefined;
    expect(lastError?.[0]).toContain("NOT serving every tenant");
    expect(lastError?.[1]).toMatchObject({
      servedTenants: 1,
      skippedTenants: ["tenant-2", "tenant-3"],
      totalTenants: 3,
    });
  });

  it("stays quiet when every tenant is served", async () => {
    listTenantIds.mockResolvedValue(["tenant-1", "tenant-2"]);
    resolveSchedulerServiceScope.mockImplementation(
      async (tenantId?: string) => ({
        ok: true,
        scope: { ...scope, tenantId: tenantId ?? "tenant-1" },
      })
    );
    const { mastra } = fakeMastra();

    await startScheduler({ mastra });
    await vi.runAllTimersAsync();

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
