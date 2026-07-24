import { describe, expect, it, vi } from "vitest";
import type { Task } from "../schema/types.js";
import {
  AGENT_TASK_DISPATCH_QUEUE,
  enqueueTaskDispatch,
  isDispatchableTask,
} from "./task-dispatch-queue.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TASK_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    cancelled_at: null,
    checkout_run_id: null,
    completed_at: null,
    created_at: "2026-06-11T00:00:00Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    goal_id: null,
    id: TASK_ID,
    identifier: "T-1",
    parent_id: null,
    primary_assignee_agent_type_key: "knowledge-base.manager",
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    priority: "medium",
    project_id: null,
    scope_id: "scope-1",
    started_at: null,
    status: "todo",
    tenant_id: TENANT_ID,
    title: "Research task",
    updated_at: "2026-06-11T00:00:00Z",
    ...overrides,
  } as Task;
}

describe("isDispatchableTask", () => {
  it("accepts an agent-assigned todo task with no checkout", () => {
    expect(isDispatchableTask(makeTask())).toBe(true);
  });

  it("accepts backlog status", () => {
    expect(
      isDispatchableTask(makeTask({ status: "backlog" as Task["status"] }))
    ).toBe(true);
  });

  it("rejects user-assigned tasks", () => {
    expect(
      isDispatchableTask(
        makeTask({
          primary_assignee_kind: "user" as Task["primary_assignee_kind"],
        })
      )
    ).toBe(false);
  });

  it("rejects tasks already checked out", () => {
    expect(
      isDispatchableTask(
        makeTask({ checkout_run_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" })
      )
    ).toBe(false);
  });

  for (const status of [
    "in_progress",
    "in_review",
    "done",
    "cancelled",
    "blocked",
  ]) {
    it(`rejects status ${status}`, () => {
      expect(
        isDispatchableTask(makeTask({ status: status as Task["status"] }))
      ).toBe(false);
    });
  }

  // These used to be enqueued and then 409 at checkout (which only admits
  // todo/backlog), leaving the run silently `skipped`. Dispatch must agree with
  // checkout: only an assigned, planned task in an entry status runs.
  it("rejects the request status (a human/coordinator must plan it into todo)", () => {
    expect(
      isDispatchableTask(makeTask({ status: "request" as Task["status"] }))
    ).toBe(false);
  });

  it("rejects tenant-defined custom statuses", () => {
    expect(
      isDispatchableTask(makeTask({ status: "waiting_qa" as Task["status"] }))
    ).toBe(false);
  });
});

describe("enqueueTaskDispatch", () => {
  it("sends the dispatch payload to the agent_task_dispatch queue", async () => {
    const send = vi.fn(async () => 1);
    await enqueueTaskDispatch(
      { send, sendBatch: vi.fn() },
      makeTask(),
      TENANT_ID
    );
    expect(send).toHaveBeenCalledWith(AGENT_TASK_DISPATCH_QUEUE, {
      agent_type_key: "knowledge-base.manager",
      task_id: TASK_ID,
      tenant_id: TENANT_ID,
    });
  });

  it("skips silently when the agent type key is missing", async () => {
    const send = vi.fn(async () => 1);
    await enqueueTaskDispatch(
      { send, sendBatch: vi.fn() },
      makeTask({ primary_assignee_agent_type_key: null }),
      TENANT_ID
    );
    expect(send).not.toHaveBeenCalled();
  });
});
