// The wake sweep's contract, with the engine stubbed out.
//
// What matters here is not that Mastra resumes correctly — `dispatch` and the
// integration suites cover that — but that the sweep's BOOKKEEPING is right,
// because every failure mode of a long wait is a bookkeeping failure: a run
// woken twice, a run never woken, or a run left looking in-flight forever.
import { beforeEach, describe, expect, it, vi } from "vitest";

const resumeGraphRun = vi.fn();
const settleGraphRun = vi.fn();

vi.mock("../dispatch.js", () => ({
  resumeGraphRun: (...args: unknown[]) => resumeGraphRun(...args),
}));
vi.mock("../run-lifecycle.js", () => ({
  settleGraphRun: (...args: unknown[]) => settleGraphRun(...args),
}));

const { sweepDueGraphWaits } = await import("../wake-sweep.js");

const TENANT = "tenant-a";

function sleepingRow(overrides: Record<string, unknown> = {}) {
  return {
    workflow_version_id: "version-1",
    workflow_id: "graph-1",
    agent_id: "workflow:graph-1",
    context_id: "invoice-9",
    context_type: "invoices.invoice",
    created_at: new Date().toISOString(),
    id: "request-1",
    reason: null,
    run_id: "run-1",
    status: "sleeping",
    thread_id: "thread-1",
    trigger: "button",
    updated_at: new Date().toISOString(),
    wake_at: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

const version = {
  workflow_id: "graph-1",
  allowed_tools: ["invoices_send"],
  approved_at: new Date().toISOString(),
  approved_by_user_id: null,
  authored_by: "user" as const,
  created_at: new Date().toISOString(),
  created_by_user_id: null,
  graph: { graph: [], id: "workflow:graph-1" },
  id: "version-1",
  input_schema: {},
  output_schema: {},
  tenant_id: TENANT,
  version: 3,
};

function stores(options: {
  claimed: ReturnType<typeof sleepingRow>[];
  version?: typeof version | null;
}) {
  const finish = vi.fn().mockResolvedValue(undefined);
  const claimDueSleepers = vi.fn().mockResolvedValue(options.claimed);
  const getVersion = vi
    .fn()
    .mockResolvedValue(
      options.version === undefined ? version : options.version
    );
  return {
    // The mocks themselves for assertions; the `as never` casts are only how
    // they're handed to the function under test.
    claimDueSleepers,
    finish,
    getVersion,
    graphs: { getVersion } as never,
    requests: { claimDueSleepers, finish } as never,
  };
}

beforeEach(() => {
  resumeGraphRun.mockReset().mockResolvedValue({ status: "success" });
  settleGraphRun.mockReset().mockResolvedValue(undefined);
});

describe("sweepDueGraphWaits", () => {
  it("resumes a due run onto the version it was pinned to", async () => {
    const { graphs, requests } = stores({ claimed: [sleepingRow()] });

    const result = await sweepDueGraphWaits({
      graphs,
      requests,
      tenantId: TENANT,
    });

    expect(result).toEqual({ claimed: 1, failed: 0, resumed: 1 });
    const call = resumeGraphRun.mock.calls[0]?.[0] as Record<string, any>;
    // Pinned version, not "the current one" — a long-lived run must never be
    // resumed onto a graph it did not start on.
    expect(call.version.version).toBe(3);
    expect(call.runId).toBe("run-1");
    expect(call.ctx.tenantId).toBe(TENANT);
    expect(call.ctx.contextId).toBe("invoice-9");
    expect(call.ctx.allowedToolIds).toEqual(["invoices_send"]);
    // The clock woke it, so there is no user behind the resume.
    expect(call.ctx.userId).toBeUndefined();
    expect(typeof call.resumeData.woke_at).toBe("string");
    expect(settleGraphRun).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one run fails, and marks that run failed", async () => {
    const { finish, graphs, requests } = stores({
      claimed: [sleepingRow({ id: "bad", run_id: "run-bad" }), sleepingRow()],
    });
    resumeGraphRun
      .mockRejectedValueOnce(new Error("engine exploded"))
      .mockResolvedValue({ status: "success" });

    const result = await sweepDueGraphWaits({
      graphs,
      requests,
      tenantId: TENANT,
    });

    expect(result).toEqual({ claimed: 2, failed: 1, resumed: 1 });
    // A run that cannot be resumed is over — it must not sit in `dispatched`
    // pretending to be in flight.
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ id: "bad", status: "failed" })
    );
  });

  it("refuses to substitute a graph when the pinned version is gone", async () => {
    const { finish, graphs, requests } = stores({
      claimed: [sleepingRow()],
      version: null,
    });

    const result = await sweepDueGraphWaits({
      graphs,
      requests,
      tenantId: TENANT,
    });

    expect(result.resumed).toBe(0);
    expect(resumeGraphRun).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining("pinned graph version is missing"),
        status: "failed",
      })
    );
  });

  it("skips a claimed row that has no pinned version at all", async () => {
    const { graphs, requests } = stores({
      claimed: [sleepingRow({ workflow_version_id: null })],
    });

    const result = await sweepDueGraphWaits({
      graphs,
      requests,
      tenantId: TENANT,
    });

    expect(result).toEqual({ claimed: 1, failed: 1, resumed: 0 });
    expect(resumeGraphRun).not.toHaveBeenCalled();
  });

  it("does nothing when nothing is due", async () => {
    const { graphs, requests } = stores({ claimed: [] });

    const result = await sweepDueGraphWaits({
      graphs,
      requests,
      tenantId: TENANT,
    });

    expect(result).toEqual({ claimed: 0, failed: 0, resumed: 0 });
    expect(resumeGraphRun).not.toHaveBeenCalled();
  });
});
