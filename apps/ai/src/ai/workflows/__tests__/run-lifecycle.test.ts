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
const holdRunForReview = vi.fn();
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
vi.mock("../../routines/review-hold.js", async () => ({
  ...(await vi.importActual<typeof import("../../routines/review-hold.js")>(
    "../../routines/review-hold.js"
  )),
  holdRunForReview: (...args: unknown[]) => holdRunForReview(...args),
}));
vi.mock("../run-context.js", () => ({
  forgetGraphRunScope: vi.fn(),
}));

const { fitSummary, settleGraphRun } = await import("../run-lifecycle.js");

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
  routineStore.get.mockResolvedValue(null);
});

describe("settleGraphRun with report: ask", () => {
  it("holds a completed fire for review instead of finishing it", async () => {
    getByRunId.mockResolvedValue(request({ routine_id: "routine-1" }));
    routineStore.get.mockResolvedValue({
      agent_id: "mail.watch",
      created_by_user_id: "user-1",
      id: "routine-1",
      name: "Mail-Antwort-Wache",
      report: "ask",
      space_id: null,
      tenant_id: TENANT,
    });
    await settleGraphRun({
      outcome: { result: { summary: "1 reply" }, status: "success" },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(holdRunForReview).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1", summary: "1 reply" })
    );
    expect(finish).not.toHaveBeenCalled();
    expect(finishActionRun).not.toHaveBeenCalled();
    expect(reportRoutineRun).toHaveBeenCalledWith(
      expect.objectContaining({ awaitingReview: true, routineId: "routine-1" })
    );
  });

  it("does not hold a crash — a failure is an alert, not a review", async () => {
    getByRunId.mockResolvedValue(request({ routine_id: "routine-1" }));
    routineStore.get.mockResolvedValue({
      agent_id: "mail.watch",
      created_by_user_id: "user-1",
      id: "routine-1",
      name: "Mail-Antwort-Wache",
      report: "ask",
      space_id: null,
      tenant_id: TENANT,
    });
    await settleGraphRun({
      outcome: { reason: "boom", status: "failed" },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(holdRunForReview).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("finishes a desk_card routine's run as before", async () => {
    getByRunId.mockResolvedValue(request({ routine_id: "routine-1" }));
    routineStore.get.mockResolvedValue({
      id: "routine-1",
      report: "desk_card",
    });
    await settleGraphRun({
      outcome: { result: "done", status: "success" },
      requestId: "request-1",
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(holdRunForReview).not.toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
  });
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

// Fails if: a long closing line cuts the record link in half (the page then
// has no record to open); the prose is not shortened; a short line changes.
describe("fitSummary", () => {
  const link =
    "[ang-2026-1004 — Angebot Donau Logistik AG](/s/sales/offers/01a0)";

  it("keeps the record link whole and shortens the prose before it", () => {
    const prose = "Die Aufgabe wurde angelegt. ".repeat(30).trim();
    const fitted = fitSummary(`${prose}\n\n${link}`) ?? "";
    expect(fitted.endsWith(`\n\n${link}`)).toBe(true);
    expect(fitted.length).toBeLessThanOrEqual(500);
    expect(fitted.length).toBeLessThan(prose.length);
  });

  it("leaves a short line as it is", () => {
    expect(fitSummary(`Fertig.\n\n${link}`)).toBe(`Fertig.\n\n${link}`);
  });
});
