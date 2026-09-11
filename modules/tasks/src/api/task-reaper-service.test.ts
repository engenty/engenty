import { describe, expect, it, vi } from "vitest";
import type { Task } from "../schema/types.js";
import { AGENT_TASK_DISPATCH_QUEUE } from "./task-dispatch-queue.js";
import {
  type ReaperTasksRepo,
  reapStaleCheckouts,
} from "./task-reaper-service.js";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");

let seq = 0;
function makeTask(overrides: Partial<Task> = {}): Task {
  seq += 1;
  return {
    approval_grants: [],
    approval_grants_once: [],
    blocked_by_task_ids: [],
    cancelled_at: null,
    checkout_run_id: `run-${seq}`,
    completed_at: null,
    created_at: "2026-07-23T00:00:00.000Z",
    created_by_agent_type_key: null,
    created_by_user_id: null,
    description: null,
    due_date: null,
    id: `task-${seq}`,
    identifier: `ENG-${seq}`,
    parent_id: null,
    primary_assignee_agent_type_key: "contacts.manager",
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    priority: "medium",
    project_id: null,
    scope_id: "scope",
    started_at: "2026-07-23T00:00:00.000Z",
    status: "in_progress",
    tenant_id: "tenant",
    title: "T",
    space_id: "space-1",
    // Old enough that a missing run row counts as stale.
    updated_at: "2026-07-23T10:00:00.000Z",
    ...overrides,
  } as Task;
}

function makeRepo(
  claimed: Task[],
  runStates: Record<string, "running" | "finished" | "missing">
) {
  const comments: string[] = [];
  const activity: Array<{ event_type: string; payload?: unknown }> = [];
  const released: string[] = [];
  const repo: ReaperTasksRepo = {
    addComment: async (_id, content) => {
      comments.push(content);
    },
    getCheckoutRunState: async (runId) => runStates[runId] ?? "missing",
    listClaimedTasks: async () => claimed,
    loadTaskStatuses: async () => new Map(),
    recordActivity: async (input) => {
      activity.push({ event_type: input.event_type, payload: input.payload });
    },
    releaseTask: async (taskId) => {
      released.push(taskId);
      const task = claimed.find((t) => t.id === taskId);
      return task ? { ...task, checkout_run_id: null, status: "todo" } : null;
    },
    updateTask: async (id, input) => {
      const task = claimed.find((t) => t.id === id);
      return task ? { ...task, status: input.status ?? task.status } : null;
    },
  };
  return { activity, comments, released, repo };
}

const queue = () => ({ send: vi.fn(async () => 1), sendBatch: vi.fn() });

describe("reapStaleCheckouts", () => {
  it("releases and re-dispatches a task whose run finished without cleanup", async () => {
    const task = makeTask();
    const { activity, comments, released, repo } = makeRepo([task], {
      [task.checkout_run_id as string]: "finished",
    });
    const q = queue();

    const result = await reapStaleCheckouts({
      now: () => NOW,
      queue: q as never,
      repo,
      tenantId: "tenant",
    });

    expect(result.checked).toBe(1);
    expect(result.reaped).toHaveLength(1);
    expect(released).toEqual([task.id]);
    expect(comments[0]).toContain("stale checkout");
    expect(activity[0]?.event_type).toBe("tasks.checkout_reaped");
    expect(q.send).toHaveBeenCalledWith(
      AGENT_TASK_DISPATCH_QUEUE,
      expect.objectContaining({ task_id: task.id })
    );
  });

  it("never touches a task whose run is alive", async () => {
    const task = makeTask();
    const { released, repo } = makeRepo([task], {
      [task.checkout_run_id as string]: "running",
    });

    const result = await reapStaleCheckouts({
      now: () => NOW,
      repo,
      tenantId: "tenant",
    });

    expect(result.reaped).toHaveLength(0);
    expect(released).toHaveLength(0);
  });

  it("gives a missing run row a grace window before reaping", async () => {
    // Checked out one minute ago — register write may still be in flight.
    const fresh = makeTask({
      updated_at: new Date(NOW - 60_000).toISOString(),
    });
    const { released, repo } = makeRepo([fresh], {});

    const result = await reapStaleCheckouts({
      now: () => NOW,
      repo,
      tenantId: "tenant",
    });
    expect(result.reaped).toHaveLength(0);
    expect(released).toHaveLength(0);
  });

  it("reaps a missing run row after the grace window", async () => {
    const orphaned = makeTask({
      updated_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
    });
    const { released, repo } = makeRepo([orphaned], {});

    const result = await reapStaleCheckouts({
      now: () => NOW,
      repo,
      tenantId: "tenant",
    });
    expect(result.reaped).toHaveLength(1);
    expect(released).toEqual([orphaned.id]);
    expect(result.reaped[0]?.run_id).toBe(orphaned.checkout_run_id);
  });

  it("only reaps claimed tasks in the active Space when spaceId is set", async () => {
    const inSpace = makeTask({ space_id: "space-a" });
    const otherSpace = makeTask({ space_id: "space-b" });
    const { released, repo } = makeRepo([inSpace, otherSpace], {
      [inSpace.checkout_run_id as string]: "finished",
      [otherSpace.checkout_run_id as string]: "finished",
    });

    const result = await reapStaleCheckouts({
      now: () => NOW,
      repo,
      spaceId: "space-a",
      tenantId: "tenant",
    });

    expect(result.checked).toBe(1);
    expect(released).toEqual([inSpace.id]);
  });
});
