import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeMockTasksRepo } from "../api/test-helpers.js";
import { canTransitionTaskStatus } from "../domain/task-lifecycle.js";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";

describe("task checkout", () => {
  const runA = randomUUID();
  const runB = randomUUID();

  it("returns 409-shaped conflict when another run holds checkout", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Checkout race" });
    await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });

    await expect(
      repo.checkoutTask(task.id, {
        agent_session_run_id: runB,
        agent_type_key: "dynamic_supervisor",
      })
    ).rejects.toMatchObject({
      code: "task_checkout_conflict",
      conflict: {
        checkout_run_id: runA,
        current_status: "in_progress",
        current_assignee_kind: "agent",
      },
    });
  });

  it("is idempotent when the same run already holds checkout", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Idempotent checkout" });
    const first = await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });
    const second = await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });
    expect(second.id).toBe(first.id);
    expect(second.checkout_run_id).toBe(runA);
    expect(second.status).toBe("in_progress");
  });

  // A run that stops for a person parks the task (released to `in_review`) and
  // resumes under the SAME run id once the answer lands. That second checkout
  // used to insert a second run row, so run history showed one run twice —
  // split at the point where it stopped to ask.
  it("records one run row when a parked run resumes under the same id", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Asks a question" });
    await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });
    // Parking is two writes: release clears the checkout, then the run's
    // finalize parks the task at `in_review` so the briefing surfaces the ask.
    await repo.releaseTask(task.id, { outcome: "needs_input" });
    await repo.updateTask(task.id, { status: "in_review" });
    // Answering re-opens it: the comment path flips it back to `todo` and
    // re-dispatches, which is how checkout is reachable a second time.
    await repo.updateTask(task.id, { status: "todo" });
    await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });

    const rows = await repo.listTaskRuns(task.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.agent_session_run_id).toBe(runA);
    // Re-opened: the run is running again, so its prior ending is not final.
    expect(rows[0]?.finished_at).toBeFalsy();
  });

  it("releases checkout and returns task to todo", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Release me" });
    await repo.checkoutTask(task.id, {
      agent_session_run_id: runA,
      agent_type_key: "dynamic_supervisor",
    });
    const released = await repo.releaseTask(task.id);
    expect(released?.checkout_run_id).toBeNull();
    expect(released?.status).toBe("todo");
  });

  it("throws TaskCheckoutConflictError with structured conflict body", () => {
    const err = new TaskCheckoutConflictError({
      current_status: "in_progress",
      current_assignee_kind: "agent",
      checkout_run_id: runA,
    });
    expect(err.message).toBe("task_checkout_conflict");
    expect(err.conflict.checkout_run_id).toBe(runA);
  });
});

describe("agent update checkout enforcement", () => {
  it("blocks agent in_progress without active checkout", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Agent blocked" });
    await expect(
      repo.updateTask(
        task.id,
        { status: "in_progress" },
        { actorKind: "agent", hasActiveCheckout: false }
      )
    ).rejects.toThrow("task_checkout_required");
  });

  it("allows human in_progress without checkout", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Human ok" });
    const updated = await repo.updateTask(
      task.id,
      { status: "in_progress" },
      { actorKind: "user", hasActiveCheckout: false }
    );
    expect(updated?.status).toBe("in_progress");
  });

  it("allows reopening a done task", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Reopen me" });
    const done = await repo.updateTask(task.id, { status: "done" });
    expect(done?.status).toBe("done");
    const reopened = await repo.updateTask(task.id, { status: "todo" });
    expect(reopened?.status).toBe("todo");
  });

  it("allows agent in_progress when checkout is active", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({ title: "Agent with checkout" });
    const runId = randomUUID();
    await repo.checkoutTask(task.id, {
      agent_session_run_id: runId,
      agent_type_key: "dynamic_supervisor",
    });
    const updated = await repo.updateTask(
      task.id,
      { status: "in_review" },
      { actorKind: "agent", hasActiveCheckout: true }
    );
    expect(updated?.status).toBe("in_review");
    expect(
      canTransitionTaskStatus({
        actorKind: "agent",
        from: "todo",
        to: "in_progress",
        hasActiveCheckout: true,
      })
    ).toBe(true);
  });
});
