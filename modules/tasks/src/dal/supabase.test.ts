// updateTask against the REAL supabase DAL (fake PostgREST client): the
// mock repo in api/test-helpers spreads the whole patch, so only a DAL-level
// test can catch an allow-listed field being silently dropped — a class of bug
// this update path has produced before.

import { describe, expect, it } from "vitest";
import { createTasksRepoSupabase } from "./supabase.js";

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    tenant_id: "tenant-1",
    scope_id: "default",
    identifier: "ENG-1",
    title: "Reconcile the August invoices",
    description: null,
    status: "backlog",
    priority: "medium",
    parent_id: null,
    project_id: null,
    space_id: "space-1",
    primary_assignee_kind: "agent",
    primary_assignee_user_id: null,
    primary_assignee_agent_type_key: "dynamic_supervisor",
    blocked_by_task_ids: [],
    created_by_user_id: null,
    created_by_agent_type_key: null,
    due_date: null,
    pending_approval_operation_ids: [],
    started_at: null,
    completed_at: null,
    cancelled_at: null,
    checkout_run_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const activityRow = {
  id: "a1",
  tenant_id: "tenant-1",
  scope_id: "default",
  task_id: "t1",
  event_type: "tasks.assignee_changed",
  payload: {},
  actor_user_id: null,
  actor_agent_type_key: null,
  created_at: "2026-08-01T00:00:00Z",
};

interface Recorded {
  args: unknown[];
  method: string;
}

/**
 * Chainable PostgREST fake with a FIFO of terminal responses: each
 * maybeSingle()/single()/await pops the next canned response. Records every
 * chained call for assertions. (Same shape as other module DAL fakes.)
 */
function createFakeSupabase(responses: unknown[]) {
  const queue = [...responses];
  const calls: Recorded[] = [];
  const next = () =>
    Promise.resolve(
      queue.shift() ?? { data: null, error: { message: "queue empty" } }
    );
  function builder() {
    const b: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "is",
      "in",
      "like",
      "or",
      "order",
      "limit",
      "insert",
      "update",
      "upsert",
      "delete",
    ]) {
      b[method] = (...args: unknown[]) => {
        calls.push({ args, method });
        return b;
      };
    }
    b.maybeSingle = () => {
      calls.push({ args: [], method: "maybeSingle" });
      return next();
    };
    b.single = () => {
      calls.push({ args: [], method: "single" });
      return next();
    };
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable Supabase query mock
    b.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => next().then(resolve, reject);
    return b;
  }
  return {
    calls,
    client: { schema: () => ({ from: () => builder() }) } as never,
  };
}

/** Responses for one updateTask call: getTask (row + collaborators +
 *  contexts + comments), settings, the update itself, collaborators again.
 *  A patch that touches assignee fields also appends an activity row. */
function updateTaskResponses(
  existing: unknown,
  updated: unknown,
  opts: { assigneeChanged?: boolean } = {}
) {
  return [
    { data: existing, error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: [], error: null },
    { data: updated, error: null },
    { data: [], error: null },
    ...(opts.assigneeChanged ? [{ data: activityRow, error: null }] : []),
  ];
}

function updatePayload(calls: Recorded[]) {
  const update = calls.find((call) => call.method === "update");
  expect(update).toBeDefined();
  return update?.args[0] as Record<string, unknown>;
}

describe("tasks repo — updateTask assignee round-trip", () => {
  it("re-assigns agent → user and clears the agent key", async () => {
    const fake = createFakeSupabase(
      updateTaskResponses(
        taskRow(),
        taskRow({
          primary_assignee_kind: "user",
          primary_assignee_agent_type_key: null,
          primary_assignee_user_id: "user-1",
        }),
        { assigneeChanged: true }
      )
    );
    const repo = createTasksRepoSupabase(fake.client, "tenant-1", "default");

    const updated = await repo.updateTask("t1", {
      primary_assignee_kind: "user",
      primary_assignee_agent_type_key: null,
      primary_assignee_user_id: "user-1",
    });

    const payload = updatePayload(fake.calls);
    expect(payload.primary_assignee_kind).toBe("user");
    // An explicit null in the patch must actually clear the key, not fall back
    // to the row's value.
    expect(payload.primary_assignee_agent_type_key).toBeNull();
    expect(payload.primary_assignee_user_id).toBe("user-1");
    expect(updated?.primary_assignee_user_id).toBe("user-1");
  });

  it("re-assigns user → agent and clears the user id", async () => {
    const existing = taskRow({
      primary_assignee_kind: "user",
      primary_assignee_agent_type_key: null,
      primary_assignee_user_id: "user-1",
    });
    const fake = createFakeSupabase(
      updateTaskResponses(
        existing,
        taskRow({ primary_assignee_agent_type_key: "helper" }),
        { assigneeChanged: true }
      )
    );
    const repo = createTasksRepoSupabase(fake.client, "tenant-1", "default");

    const updated = await repo.updateTask("t1", {
      primary_assignee_kind: "agent",
      primary_assignee_agent_type_key: "helper",
    });

    const payload = updatePayload(fake.calls);
    expect(payload.primary_assignee_kind).toBe("agent");
    expect(payload.primary_assignee_agent_type_key).toBe("helper");
    expect(payload.primary_assignee_user_id).toBeNull();
    expect(updated?.primary_assignee_agent_type_key).toBe("helper");
  });

  it("leaves the assignee columns untouched when the patch does not carry them", async () => {
    const existing = taskRow();
    const fake = createFakeSupabase(
      updateTaskResponses(existing, { ...existing, title: "Renamed" })
    );
    const repo = createTasksRepoSupabase(fake.client, "tenant-1", "default");

    await repo.updateTask("t1", { title: "Renamed" });

    const payload = updatePayload(fake.calls);
    expect(payload.title).toBe("Renamed");
    expect(payload).not.toHaveProperty("primary_assignee_kind");
    expect(payload).not.toHaveProperty("primary_assignee_agent_type_key");
  });
});
