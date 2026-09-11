// The settle's contract fields, with the stores stubbed out.
//
// What matters here is the two-plane rule: the engine's status and the flow's
// outcome are recorded side by side, an invalid contract value degrades to
// null instead of failing the run, and a broken output-schema promise voids
// the verdict without rewriting what actually happened.
import { beforeEach, describe, expect, it, vi } from "vitest";

const finish = vi.fn();
const getByRunId = vi.fn();
const finishActionRun = vi.fn();
const reportRoutineRun = vi.fn();
const routineStore = { get: vi.fn() };

vi.mock("../../index.js", () => ({
  createWorkflowRunStoreFromEnv: () => ({ finish, getByRunId }),
  createAgentRunStoreFromEnv: () => null,
  createArtifactStoreFromEnv: () => null,
  createRoutineStoreFromEnv: () => routineStore,
}));
vi.mock("../../jobs/action-job-run-record.js", () => ({
  finishActionRun: (...args: unknown[]) => finishActionRun(...args),
}));
vi.mock("../../routines/report-routine-run.js", () => ({
  reportRoutineRun: (...args: unknown[]) => reportRoutineRun(...args),
}));
vi.mock("../run-context.js", () => ({
  forgetGraphRunScope: vi.fn(),
}));

const { settleGraphRun } = await import("../run-lifecycle.js");

const TENANT = "tenant-a";

function request(overrides: Record<string, unknown> = {}) {
  return {
    created_at: new Date().toISOString(),
    id: "request-1",
    routine_id: null,
    run_id: "run-1",
    thread_id: "thread-1",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getByRunId.mockResolvedValue(request());
});

describe("settleGraphRun contract fields", () => {
  it("persists the flow's outcome and reporting beside the engine status", async () => {
    await settleGraphRun({
      outcome: {
        result: { outcome: "partial", reporting: "verbose", summary: "3 of 5" },
        status: "success",
      },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "partial",
        reporting: "verbose",
        status: "completed",
        summary: "3 of 5",
      })
    );
  });

  it("drops an invalid contract value to null instead of failing the run", async () => {
    await settleGraphRun({
      outcome: { result: { outcome: "partail" }, status: "success" },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: null, status: "completed" })
    );
  });

  it("keeps a prose result's columns null — the pre-contract world", async () => {
    await settleGraphRun({
      outcome: { result: "all done", status: "success" },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: null, reporting: null })
    );
  });

  it("voids the verdict when the declared output schema is broken, and says why", async () => {
    await settleGraphRun({
      outcome: {
        result: { count: "three", outcome: "ok" },
        status: "success",
      },
      outputSchema: {
        properties: { count: { type: "number" } },
        required: ["count"],
        type: "object",
      },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    const call = finish.mock.calls[0]?.[0] as {
      outcome: string | null;
      reason: string | null;
      status: string;
    };
    // The work happened — status stays completed. The verdict is voided.
    expect(call.status).toBe("completed");
    expect(call.outcome).toBeNull();
    expect(call.reason).toContain("did not match the declared schema");
  });

  it("skips the schema check for an empty declaration — prose stays legal", async () => {
    await settleGraphRun({
      outcome: { result: "prose answer", status: "success" },
      outputSchema: {},
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    const call = finish.mock.calls[0]?.[0] as { reason: string | null };
    expect(call.reason).toBeNull();
  });

  it("hands outcome, reporting and the amended reason to the routine report", async () => {
    getByRunId.mockResolvedValue(request({ routine_id: "routine-1" }));
    await settleGraphRun({
      outcome: {
        result: { outcome: "nothing_to_do", reporting: "silent" },
        status: "success",
      },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(reportRoutineRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "nothing_to_do",
        reporting: "silent",
        routineId: "routine-1",
      })
    );
  });
});
