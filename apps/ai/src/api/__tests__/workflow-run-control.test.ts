// The two run controls a wizard page adds beside `resume`: stepping back to
// an earlier gate and stopping the run. Both refuse a run that is not where
// they expect it, and both settle through the one lifecycle funnel.
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/workflows/dispatch.js", () => ({
  cancelGraphRun: vi.fn(),
  resumeGraphRun: vi.fn(),
  timeTravelGraphRun: vi.fn(),
}));
vi.mock("../../ai/workflows/run-lifecycle.js", () => ({
  settleGraphRun: vi.fn(),
}));
vi.mock("../../ai/routines/review-hold.js", () => ({
  releaseReviewedRun: vi.fn(),
}));

import {
  cancelGraphRun,
  timeTravelGraphRun,
} from "../../ai/workflows/dispatch.js";
import { settleGraphRun } from "../../ai/workflows/run-lifecycle.js";
import { registerWorkflowRoutes } from "../workflow-routes.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

const cancelMock = vi.mocked(cancelGraphRun);
const travelMock = vi.mocked(timeTravelGraphRun);
const settleMock = vi.mocked(settleGraphRun);

function buildApp(requestStatus: string) {
  const request = {
    context_id: null,
    context_type: null,
    id: "request-1",
    run_id: RUN_ID,
    status: requestStatus,
    thread_id: null,
    workflow_id: "graph-1",
    workflow_version_id: "version-1",
  };
  const store = {
    // Read on every continuation: it carries the desk the run speaks into.
    getGraph: vi.fn().mockResolvedValue({
      id: "graph-1",
      owner_agent_id: "offers.manager",
    }),
    getVersion: vi.fn().mockResolvedValue({
      allowed_tools: null,
      graph: {},
      id: "version-1",
      output_schema: {},
      version: 1,
      workflow_id: "graph-1",
    }),
  };
  const runs = { getByRunId: vi.fn().mockResolvedValue(request) };
  const app = new Hono();
  registerWorkflowRoutes(app as never, {
    getWorkflowStore: () => store as never,
    getWorkflowRunStore: () => runs as never,
    scopeResolver: () =>
      Promise.resolve({
        ok: true as const,
        scope: { tenantId: TENANT_ID, userId: USER_ID },
      } as never),
  });
  return app;
}

function post(app: Hono, path: string, body: Record<string, unknown> = {}) {
  return app.request(`/ai/v1/workflows/runs/${RUN_ID}/${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

beforeEach(() => {
  cancelMock.mockReset();
  travelMock.mockReset();
  settleMock.mockReset();
});

describe("POST /runs/:runId/time-travel", () => {
  it("steps a parked run back to the named gate and settles the outcome", async () => {
    travelMock.mockResolvedValue({
      gate: {
        accepts_text: false,
        path: ["ask"],
        stepId: "ask",
        surface: { components: [], data: {} },
      },
      status: "suspended",
    });
    const res = await post(buildApp("requires_action"), "time-travel", {
      step_path: ["ask"],
    });
    expect(res.status).toBe(200);
    expect(travelMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ID, stepId: ["ask"] })
    );
    expect(settleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({ status: "suspended" }),
        runId: RUN_ID,
      })
    );
  });

  it("needs a step", async () => {
    const res = await post(buildApp("requires_action"), "time-travel");
    expect(res.status).toBe(400);
    expect(travelMock).not.toHaveBeenCalled();
  });

  it("refuses a run that is not parked", async () => {
    const res = await post(buildApp("dispatched"), "time-travel", {
      step_id: "ask",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "workflows.runNotParked" });
    expect(travelMock).not.toHaveBeenCalled();
  });
});

describe("POST /runs/:runId/cancel", () => {
  it("cancels a parked run and settles it as cancelled", async () => {
    cancelMock.mockResolvedValue(undefined);
    const res = await post(buildApp("requires_action"), "cancel");
    expect(res.status).toBe(200);
    expect(cancelMock).toHaveBeenCalledWith(
      expect.objectContaining({ runId: RUN_ID })
    );
    expect(settleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({ status: "cancelled" }),
        runId: RUN_ID,
      })
    );
  });

  it("refuses a settled run", async () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      const res = await post(buildApp(status), "cancel");
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "workflows.runSettled" });
    }
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
