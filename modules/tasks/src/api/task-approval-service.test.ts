import { describe, expect, it, vi } from "vitest";
import type { Task } from "../schema/types.js";
import {
  type ApprovalTasksRepo,
  type ApprovalTriggersRepo,
  type CoreGrantsWriter,
  resolveTaskToolApproval,
} from "./task-approval-service.js";
import { AGENT_TASK_DISPATCH_QUEUE } from "./task-dispatch-queue.js";

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
    status: "blocked",
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
    trigger_id: null,
    approval_grants: [],
    approval_grants_once: [],
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    checkout_run_id: null,
    created_at: "2026-07-22T00:00:00Z",
    updated_at: "2026-07-22T00:00:00Z",
    ...overrides,
  };
}

function makeTasksRepo(task: Task) {
  const comments: string[] = [];
  const activity: { event_type: string; payload?: unknown }[] = [];
  const repo: ApprovalTasksRepo = {
    addComment: async (_id, content) => {
      comments.push(content);
    },
    clearTaskPendingApproval: async (_id, operationId) => {
      task.pending_approval_operation_ids = (
        task.pending_approval_operation_ids ?? []
      ).filter((op) => op !== operationId);
    },
    getTask: async () => task,
    loadTaskStatuses: async () => new Map(),
    recordActivity: async (input) => {
      activity.push({ event_type: input.event_type, payload: input.payload });
    },
    updateTask: async (_id, input) => {
      if (input.status) {
        task.status = input.status;
      }
      return task;
    },
  };
  return { activity, comments, repo };
}

function makeTriggersRepo() {
  const grants: { id: string; op: string }[] = [];
  const repo: ApprovalTriggersRepo = {
    addTriggerApprovalGrant: async (id, op) => {
      grants.push({ id, op });
    },
  };
  return { grants, repo };
}

function makeCoreGrants() {
  const grants: {
    operationId: string;
    scope: string;
    subjectId: string;
  }[] = [];
  const writer: CoreGrantsWriter = {
    grant: async (input) => {
      grants.push({
        operationId: input.operationId,
        scope: input.scope,
        subjectId: input.subjectId,
      });
    },
    listBySubject: async () => ({ once: [], standing: [] }),
    listOperationIds: async () => grants.map((g) => g.operationId),
    revoke: async () => {
      // not exercised by these tests
    },
    revokeOnce: async () => {
      // not exercised by these tests
    },
  };
  return { grants, writer };
}

const queue = () => ({ send: vi.fn(async () => {}) }) as never;

describe("resolveTaskToolApproval", () => {
  it("approve 'task' adds a persistent grant, flips blocked→todo, re-dispatches", async () => {
    const task = makeTask();
    const tasks = makeTasksRepo(task);
    const core = makeCoreGrants();
    const q = queue();
    const result = await resolveTaskToolApproval(
      {
        coreGrants: core.writer,
        queue: q,
        tasksRepo: tasks.repo,
        tenantId: "tenant",
      },
      {
        decision: "approve",
        operationId: "contacts_delete",
        scope: "task",
        taskId: task.id,
      }
    );
    expect(core.grants).toEqual([
      { operationId: "contacts_delete", scope: "task", subjectId: task.id },
    ]);
    expect(result.status).toBe("todo");
    expect((q as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      AGENT_TASK_DISPATCH_QUEUE,
      expect.objectContaining({ task_id: task.id })
    );
  });

  it("approve returns a task parked in a non-entry status to todo", async () => {
    // Only todo/backlog are agent-runnable; a task a human moved to in_review
    // after the pause must come back to an entry status or the grant is inert.
    const task = makeTask({ status: "in_review" });
    const tasks = makeTasksRepo(task);
    const q = queue();
    const result = await resolveTaskToolApproval(
      { queue: q, tasksRepo: tasks.repo, tenantId: "tenant" },
      {
        decision: "approve",
        operationId: "contacts_delete",
        scope: "task",
        taskId: task.id,
      }
    );
    expect(result.status).toBe("todo");
    expect((q as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalled();
    expect(tasks.comments.join("\n")).toContain("Re-running the task.");
  });

  it("approve on a claimed task records the grant without promising a re-run", async () => {
    // A live checkout owns the task — that run finalizes it; re-dispatching
    // would race it, and the old comment claimed a re-run that never happened.
    const task = makeTask({
      checkout_run_id: "11111111-1111-4111-8111-111111111111",
      status: "in_progress",
    });
    const tasks = makeTasksRepo(task);
    const core = makeCoreGrants();
    const q = queue();
    await resolveTaskToolApproval(
      {
        coreGrants: core.writer,
        queue: q,
        tasksRepo: tasks.repo,
        tenantId: "tenant",
      },
      {
        decision: "approve",
        operationId: "contacts_delete",
        scope: "task",
        taskId: task.id,
      }
    );
    expect(core.grants).toEqual([
      { operationId: "contacts_delete", scope: "task", subjectId: task.id },
    ]);
    expect(task.status).toBe("in_progress");
    expect(
      (q as { send: ReturnType<typeof vi.fn> }).send
    ).not.toHaveBeenCalled();
    expect(tasks.comments.join("\n")).toContain("next run");
    expect(tasks.activity[0]?.payload).toMatchObject({ redispatched: false });
  });

  it("approve 'once' adds a one-shot grant only", async () => {
    const task = makeTask();
    const tasks = makeTasksRepo(task);
    const core = makeCoreGrants();
    await resolveTaskToolApproval(
      {
        coreGrants: core.writer,
        queue: queue(),
        tasksRepo: tasks.repo,
        tenantId: "tenant",
      },
      {
        decision: "approve",
        operationId: "x_op",
        scope: "once",
        taskId: task.id,
      }
    );
    expect(core.grants).toEqual([
      { operationId: "x_op", scope: "once", subjectId: task.id },
    ]);
  });

  it("approve 'routine' writes the trigger grant", async () => {
    const task = makeTask({ trigger_id: "trigger-1" });
    const tasks = makeTasksRepo(task);
    const triggers = makeTriggersRepo();
    await resolveTaskToolApproval(
      {
        queue: queue(),
        tasksRepo: tasks.repo,
        tenantId: "tenant",
        triggersRepo: triggers.repo,
      },
      {
        decision: "approve",
        operationId: "y_op",
        scope: "routine",
        taskId: task.id,
      }
    );
    expect(triggers.grants).toEqual([{ id: "trigger-1", op: "y_op" }]);
  });

  it("writes each approval scope into the core grant store", async () => {
    // The core row is the ONLY store (columns dropped): dispatch reads it for
    // the pre-gate set, core-side gates spend it via the forwarded task id.
    const cases: {
      scope: "once" | "task" | "routine";
      expected: { scope: string; subject: (task: Task) => string };
    }[] = [
      { scope: "once", expected: { scope: "once", subject: (t) => t.id } },
      { scope: "task", expected: { scope: "task", subject: (t) => t.id } },
      {
        scope: "routine",
        expected: { scope: "trigger", subject: () => "trig-1" },
      },
    ];
    for (const c of cases) {
      const task = makeTask({ trigger_id: "trig-1" });
      const tasks = makeTasksRepo(task);
      const triggers = makeTriggersRepo();
      const core = makeCoreGrants();
      await resolveTaskToolApproval(
        {
          coreGrants: core.writer,
          tasksRepo: tasks.repo,
          triggersRepo: triggers.repo,
        },
        {
          decision: "approve",
          operationId: "gmail_send",
          scope: c.scope,
          taskId: task.id,
        }
      );
      expect(core.grants).toEqual([
        {
          operationId: "gmail_send",
          scope: c.expected.scope,
          subjectId: c.expected.subject(task),
        },
      ]);
    }
  });

  it("writes no core grant on deny", async () => {
    const task = makeTask();
    const tasks = makeTasksRepo(task);
    const core = makeCoreGrants();
    await resolveTaskToolApproval(
      { coreGrants: core.writer, tasksRepo: tasks.repo },
      {
        decision: "deny",
        operationId: "gmail_send",
        scope: "task",
        taskId: task.id,
      }
    );
    expect(core.grants).toEqual([]);
  });

  it("approve 'routine' without a trigger throws", async () => {
    const task = makeTask({ trigger_id: null });
    const tasks = makeTasksRepo(task);
    const triggers = makeTriggersRepo();
    await expect(
      resolveTaskToolApproval(
        {
          tasksRepo: tasks.repo,
          tenantId: "tenant",
          triggersRepo: triggers.repo,
        },
        {
          decision: "approve",
          operationId: "z_op",
          scope: "routine",
          taskId: task.id,
        }
      )
    ).rejects.toThrow("task_has_no_trigger");
  });

  // The task's own pending list — not the dismissible inbox notification — is
  // what the approval UI reads, so it has to be retired exactly when the ask is
  // answered and kept while it is still open.
  it("approve clears the answered operation from the task's pending list", async () => {
    const task = makeTask({
      pending_approval_operation_ids: ["contacts_delete", "contacts_merge"],
    });
    const tasks = makeTasksRepo(task);
    await resolveTaskToolApproval(
      { queue: queue(), tasksRepo: tasks.repo, tenantId: "tenant" },
      {
        decision: "approve",
        operationId: "contacts_delete",
        scope: "task",
        taskId: task.id,
      }
    );
    expect(task.pending_approval_operation_ids).toEqual(["contacts_merge"]);
  });

  it("deny keeps the pending entry so the task can still be approved later", async () => {
    const task = makeTask({
      pending_approval_operation_ids: ["contacts_delete"],
    });
    const tasks = makeTasksRepo(task);
    await resolveTaskToolApproval(
      { queue: queue(), tasksRepo: tasks.repo, tenantId: "tenant" },
      { decision: "deny", operationId: "contacts_delete", taskId: task.id }
    );
    expect(task.pending_approval_operation_ids).toEqual(["contacts_delete"]);
  });

  it("deny leaves the task blocked and comments", async () => {
    const task = makeTask();
    const tasks = makeTasksRepo(task);
    const result = await resolveTaskToolApproval(
      { queue: queue(), tasksRepo: tasks.repo, tenantId: "tenant" },
      { decision: "deny", operationId: "d_op", taskId: task.id }
    );
    expect(result.status).toBe("blocked");
    expect(tasks.comments.join(" ")).toContain("Denied");
  });
});
