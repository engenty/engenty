import { describe, expect, it, vi } from "vitest";
import type { Task } from "../schema/types.js";
import { AGENT_TASK_DISPATCH_QUEUE } from "./task-dispatch-queue.js";
import { type RunTaskNowRepo, runTaskNow } from "./task-run-now-service.js";

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    approval_grants: [],
    approval_grants_once: [],
    blocked_by_task_ids: [],
    cancelled_at: null,
    checkout_run_id: null,
    completed_at: null,
    created_at: "2026-07-23T00:00:00Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    goal_id: null,
    id: `task-${seq}`,
    identifier: `ENG-${seq}`,
    parent_id: null,
    primary_assignee_agent_type_key: "tasks.assist",
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    priority: "medium",
    project_id: null,
    scope_id: "scope",
    started_at: null,
    status: "todo",
    tenant_id: "tenant",
    title: "T",
    trigger_id: null,
    updated_at: "2026-07-23T00:00:00Z",
    ...overrides,
  };
}

function makeRepo(task: Task) {
  const activity: string[] = [];
  const repo: RunTaskNowRepo = {
    addComment: async () => undefined,
    getLatestAgentResultComment: async () => null,
    getTask: async () => task,
    listChildren: async () => [],
    listDependents: async () => [],
    loadTaskStatuses: async () => new Map(),
    recordActivity: async (input) => {
      activity.push(input.event_type);
    },
    updateTask: async (_id, input) => {
      if (input.status) {
        task.status = input.status;
      }
      return task;
    },
  };
  return { activity, repo };
}

const queue = () => ({ send: vi.fn(async () => {}) }) as never;

describe("runTaskNow", () => {
  it("queues an agent-assigned task on the durable dispatch path", async () => {
    const task = makeTask();
    const { activity, repo } = makeRepo(task);
    const q = queue();
    const result = await runTaskNow(
      { queue: q, repo, tenantId: "tenant" },
      { taskId: task.id }
    );
    expect(result.dispatched).toBe(true);
    expect(activity).toContain("tasks.run_requested");
    expect((q as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      AGENT_TASK_DISPATCH_QUEUE,
      expect.objectContaining({ task_id: task.id })
    );
  });

  // Only todo/backlog are claimable, so a task parked elsewhere has to come
  // back to an entry status or the queue message is popped and dropped.
  it("returns a non-entry status to todo before queueing", async () => {
    const task = makeTask({ status: "in_review" });
    const { repo } = makeRepo(task);
    await runTaskNow(
      { queue: queue(), repo, tenantId: "tenant" },
      { taskId: task.id }
    );
    expect(task.status).toBe("todo");
  });

  // Re-queueing a task a live run already owns would race that run.
  it("does not re-queue a task with a live checkout", async () => {
    const task = makeTask({
      checkout_run_id: "11111111-1111-4111-8111-111111111111",
      status: "in_progress",
    });
    const { repo } = makeRepo(task);
    const q = queue();
    const result = await runTaskNow(
      { queue: q, repo, tenantId: "tenant" },
      { taskId: task.id }
    );
    expect(result.dispatched).toBe(false);
    expect(
      (q as { send: ReturnType<typeof vi.fn> }).send
    ).not.toHaveBeenCalled();
  });

  // Refusing beats silently reassigning someone else's task to an agent.
  it("refuses a task that is not agent-assigned", async () => {
    const task = makeTask({
      primary_assignee_agent_type_key: null,
      primary_assignee_kind: "user",
      primary_assignee_user_id: "user-1",
    });
    const { repo } = makeRepo(task);
    await expect(
      runTaskNow(
        { queue: queue(), repo, tenantId: "tenant" },
        {
          taskId: task.id,
        }
      )
    ).rejects.toThrow("task_not_agent_assigned");
  });

  it("refuses a terminal task", async () => {
    const task = makeTask({ status: "done" });
    const { repo } = makeRepo(task);
    await expect(
      runTaskNow(
        { queue: queue(), repo, tenantId: "tenant" },
        {
          taskId: task.id,
        }
      )
    ).rejects.toThrow("task_terminal");
  });
});
