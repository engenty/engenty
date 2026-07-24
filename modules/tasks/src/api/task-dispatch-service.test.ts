import { describe, expect, it, vi } from "vitest";
import type { Task, TaskUpdateInput } from "../schema/types.js";
import { AGENT_TASK_DISPATCH_QUEUE } from "./task-dispatch-queue.js";
import {
  type DispatchRepo,
  dispatchTaskIfReady,
  wakeBlockedDependents,
} from "./task-dispatch-service.js";

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: overrides.id ?? `task-${seq}`,
    tenant_id: "tenant",
    scope_id: "scope",
    identifier: `ENG-${seq}`,
    title: "T",
    description: null,
    status: "todo",
    priority: "medium",
    goal_id: null,
    parent_id: null,
    project_id: null,
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    primary_assignee_agent_type_key: "contacts.manager",
    blocked_by_task_ids: [],
    created_by_user_id: null,
    created_by_agent_type_key: null,
    due_date: null,
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    checkout_run_id: null,
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
    ...overrides,
  };
}

/** In-memory DispatchRepo over a Map, recording comments + activity. */
function makeRepo(tasks: Task[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const comments: { taskId: string; content: string }[] = [];
  const activity: { task_id: string; event_type: string }[] = [];
  const repo: DispatchRepo = {
    loadTaskStatuses: async (ids) => {
      const m = new Map<string, string | undefined>();
      for (const id of ids) {
        m.set(id, byId.get(id)?.status);
      }
      return m;
    },
    listDependents: async (taskId) =>
      [...byId.values()].filter((t) => t.blocked_by_task_ids.includes(taskId)),
    listChildren: async (parentId) =>
      [...byId.values()].filter((t) => t.parent_id === parentId),
    updateTask: async (id, input: TaskUpdateInput) => {
      const t = byId.get(id);
      if (!t) {
        return null;
      }
      if (input.status !== undefined) {
        t.status = input.status;
      }
      return t;
    },
    addComment: async (taskId, content) => {
      comments.push({ taskId, content });
      return {};
    },
    recordActivity: async (input) => {
      activity.push({ task_id: input.task_id, event_type: input.event_type });
    },
  };
  return { repo, byId, comments, activity };
}

function makeQueue() {
  const send = vi.fn(async () => undefined);
  return { queue: { send } as never, send };
}

describe("dispatchTaskIfReady", () => {
  it("enqueues an agent task with no blockers", async () => {
    const task = makeTask();
    const { repo } = makeRepo([task]);
    const { queue, send } = makeQueue();
    await dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task);
    expect(send).toHaveBeenCalledWith(AGENT_TASK_DISPATCH_QUEUE, {
      agent_type_key: "contacts.manager",
      task_id: task.id,
      tenant_id: "tenant",
    });
  });

  it("does NOT enqueue a non-agent task", async () => {
    const task = makeTask({ primary_assignee_kind: "user" });
    const { repo } = makeRepo([task]);
    const { queue, send } = makeQueue();
    await dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task);
    expect(send).not.toHaveBeenCalled();
  });

  it("flips to 'blocked' and does NOT enqueue when a blocker is open", async () => {
    const blocker = makeTask({ id: "b1", status: "in_progress" });
    const task = makeTask({ id: "t1", blocked_by_task_ids: ["b1"] });
    const { repo, byId } = makeRepo([blocker, task]);
    const { queue, send } = makeQueue();
    await dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task);
    expect(send).not.toHaveBeenCalled();
    expect(byId.get("t1")?.status).toBe("blocked");
  });

  it("enqueues when every blocker is done", async () => {
    const blocker = makeTask({ id: "b1", status: "done" });
    const task = makeTask({ id: "t1", blocked_by_task_ids: ["b1"] });
    const { repo } = makeRepo([blocker, task]);
    const { queue, send } = makeQueue();
    await dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats a CANCELLED blocker as open (does not dispatch)", async () => {
    const blocker = makeTask({ id: "b1", status: "cancelled" });
    const task = makeTask({ id: "t1", blocked_by_task_ids: ["b1"] });
    const { repo, byId } = makeRepo([blocker, task]);
    const { queue, send } = makeQueue();
    await dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task);
    expect(send).not.toHaveBeenCalled();
    expect(byId.get("t1")?.status).toBe("blocked");
  });

  it("propagates markBlocked failures and records activity", async () => {
    const blocker = makeTask({ id: "b1", status: "in_progress" });
    const task = makeTask({ id: "t1", blocked_by_task_ids: ["b1"] });
    const { repo, activity } = makeRepo([blocker, task]);
    repo.updateTask = async () => {
      throw new Error("status update failed");
    };
    const { queue, send } = makeQueue();
    await expect(
      dispatchTaskIfReady({ queue, repo, tenantId: "tenant" }, task)
    ).rejects.toThrow("status update failed");
    expect(send).not.toHaveBeenCalled();
    expect(activity).toContainEqual({
      task_id: "t1",
      event_type: "tasks.block_failed",
    });
  });
});

describe("wakeBlockedDependents", () => {
  it("unblocks + dispatches a dependent whose last blocker just completed", async () => {
    const done = makeTask({ id: "b1", status: "done" });
    const dep = makeTask({
      id: "t1",
      status: "blocked",
      blocked_by_task_ids: ["b1"],
    });
    const { repo, byId, activity } = makeRepo([done, dep]);
    const { queue, send } = makeQueue();
    await wakeBlockedDependents({ queue, repo, tenantId: "tenant" }, done);
    expect(byId.get("t1")?.status).toBe("todo");
    expect(send).toHaveBeenCalledTimes(1);
    expect(activity).toContainEqual({
      task_id: "t1",
      event_type: "tasks.blockers_resolved",
    });
  });

  it("leaves a dependent blocked if another blocker is still open", async () => {
    const done = makeTask({ id: "b1", status: "done" });
    const other = makeTask({ id: "b2", status: "in_progress" });
    const dep = makeTask({
      id: "t1",
      status: "blocked",
      blocked_by_task_ids: ["b1", "b2"],
    });
    const { repo, byId } = makeRepo([done, other, dep]);
    const { queue, send } = makeQueue();
    await wakeBlockedDependents({ queue, repo, tenantId: "tenant" }, done);
    expect(byId.get("t1")?.status).toBe("blocked");
    expect(send).not.toHaveBeenCalled();
  });

  it("comments on the parent once all children are terminal", async () => {
    const parent = makeTask({ id: "p1", status: "in_progress" });
    const c1 = makeTask({ id: "c1", parent_id: "p1", status: "done" });
    const c2 = makeTask({ id: "c2", parent_id: "p1", status: "cancelled" });
    const { repo, comments, activity } = makeRepo([parent, c1, c2]);
    const { queue } = makeQueue();
    await wakeBlockedDependents({ queue, repo, tenantId: "tenant" }, c1);
    expect(comments).toContainEqual({
      taskId: "p1",
      content: "All subtasks are complete.",
    });
    expect(activity).toContainEqual({
      task_id: "p1",
      event_type: "tasks.children_completed",
    });
  });

  it("does NOT comment on the parent while a sibling is still active", async () => {
    const parent = makeTask({ id: "p1", status: "in_progress" });
    const c1 = makeTask({ id: "c1", parent_id: "p1", status: "done" });
    const c2 = makeTask({ id: "c2", parent_id: "p1", status: "in_progress" });
    const { repo, comments } = makeRepo([parent, c1, c2]);
    const { queue } = makeQueue();
    await wakeBlockedDependents({ queue, repo, tenantId: "tenant" }, c1);
    expect(comments).toHaveLength(0);
  });
});
