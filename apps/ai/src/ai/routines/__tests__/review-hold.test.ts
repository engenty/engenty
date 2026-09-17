// The hold and its release, with the stores stubbed out.
//
// What matters: a held run keeps its result but not a terminal status, the
// inbox gets exactly one decision, and releasing finishes the run the way a
// settle would — idempotently, so a second click changes nothing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoutineRow } from "../../../dal/routines/routine-store.js";

const finishActionRun = vi.fn();
const notifyRunSuspended = vi.fn();
const resolveRunNotifications = vi.fn();
const emitGraphRunTerminal = vi.fn();
const forgetGraphRunScope = vi.fn();
const appendMessage = vi.fn();
const resolveRoutineOwnerThread = vi.fn();

vi.mock("../../jobs/action-job-run-record.js", () => ({
  finishActionRun: (...args: unknown[]) => finishActionRun(...args),
}));
vi.mock("../../../notifications/run-notifications.js", () => ({
  notifyRunSuspended: (...args: unknown[]) => notifyRunSuspended(...args),
  resolveRunNotifications: (...args: unknown[]) =>
    resolveRunNotifications(...args),
}));
vi.mock("../../workflows/run-events.js", () => ({
  emitGraphRunTerminal: (...args: unknown[]) => emitGraphRunTerminal(...args),
}));
vi.mock("../../workflows/run-context.js", () => ({
  forgetGraphRunScope: (...args: unknown[]) => forgetGraphRunScope(...args),
}));
vi.mock("../../index.js", () => ({
  createThreadStoreFromEnv: () => ({ appendMessage }),
}));
vi.mock("../report-routine-run.js", () => ({
  resolveRoutineOwnerThread: (...args: unknown[]) =>
    resolveRoutineOwnerThread(...args),
}));

const { holdRunForReview, releaseReviewedRun, routineHoldsForReview } =
  await import("../review-hold.js");

const TENANT = "tenant-a";
const routine = {
  agent_id: "mail.watch",
  created_by_user_id: "user-1",
  id: "routine-1",
  name: "Mail-Antwort-Wache",
  report: "ask",
  space_id: "space-1",
  tenant_id: TENANT,
} as RoutineRow;

beforeEach(() => {
  vi.clearAllMocks();
  resolveRoutineOwnerThread.mockResolvedValue("chat-1");
});

describe("routineHoldsForReview", () => {
  it("is the ask knob and nothing else", () => {
    expect(routineHoldsForReview({ report: "ask" })).toBe(true);
    expect(routineHoldsForReview({ report: "desk_card" })).toBe(false);
    expect(routineHoldsForReview(null)).toBe(false);
  });
});

describe("holdRunForReview", () => {
  it("parks both run rows with the result and raises one decision", async () => {
    const finish = vi.fn();
    await holdRunForReview({
      outcome: "ok",
      request: {
        agent_id: "workflow:w1",
        id: "request-1",
        thread_id: "thread-1",
        workflow_id: "w1",
      },
      requests: { finish },
      routine,
      runId: "run-1",
      summary: "1 reply",
      tenantId: TENANT,
    });
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "ok",
        status: "requires_action",
        summary: "1 reply",
      })
    );
    expect(finishActionRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "requires_action" })
    );
    expect(notifyRunSuspended).toHaveBeenCalledTimes(1);
    expect(notifyRunSuspended).toHaveBeenCalledWith(
      expect.objectContaining({
        ask: expect.objectContaining({ kind: "routine_review" }),
        routineId: "routine-1",
        subject: { id: "run-1", type: "run" },
      })
    );
    expect(forgetGraphRunScope).toHaveBeenCalled();
  });
});

describe("releaseReviewedRun", () => {
  it("finishes a held run, resolves the decision and ends the stream", async () => {
    const finish = vi.fn();
    const result = await releaseReviewedRun({
      request: { id: "request-1", status: "requires_action", thread_id: "t1" },
      requests: { finish },
      routine,
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(result).toBe("released");
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
    expect(finishActionRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" })
    );
    expect(resolveRunNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "decided" })
    );
    expect(emitGraphRunTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1" }),
      { status: "completed" }
    );
    expect(appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "chat-1" })
    );
  });

  it("changes nothing for a run that is not held", async () => {
    const finish = vi.fn();
    const result = await releaseReviewedRun({
      request: { id: "request-1", status: "completed", thread_id: "t1" },
      requests: { finish },
      routine,
      runId: "run-1",
      tenantId: TENANT,
    });
    expect(result).toBe("not_held");
    expect(finish).not.toHaveBeenCalled();
    expect(resolveRunNotifications).not.toHaveBeenCalled();
  });
});
