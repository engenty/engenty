// Integration: the tasks repo against the real local Supabase — actual SQL,
// constraints, FK chains, and the conditional-update checkout path that the
// in-memory `makeMockTasksRepo` can only approximate. Seeds isolated tenants;
// cleanup rides the `core.tenants` cascade.
//
// Run via `pnpm test:integration` (local stack + migrations required).

import {
  createIntegrationDb,
  seedTenants,
  seedUsers,
} from "@engenty/test-kit/integration";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TaskCheckoutConflictError } from "../lib/task-checkout-errors.js";
import type { Task } from "../schema/types.js";
import { createTasksRepoSupabase } from "./supabase.js";

const TENANT_A = "17a5c000-0000-4000-8000-00000000000a";
const TENANT_B = "17a5c000-0000-4000-8000-00000000000b";
const USER_1 = "17a5c000-0000-4000-8000-000000000101";
const THREAD_1 = "17a5c000-0000-4000-8000-000000000201";
const RUN_1 = "17a5c000-0000-4000-8000-000000000301";
const RUN_2 = "17a5c000-0000-4000-8000-000000000302";
const SCOPE = "default";
const AGENT = "engenty.coordinator";

describe("tasks repo (real local Supabase)", () => {
  let db: SupabaseClient;
  let cleanup: () => Promise<void>;
  let repoA: ReturnType<typeof createTasksRepoSupabase>;
  let repoB: ReturnType<typeof createTasksRepoSupabase>;

  beforeAll(async () => {
    db = createIntegrationDb();
    cleanup = await seedTenants(db, [{ id: TENANT_A }, { id: TENANT_B }]);
    await seedUsers(db, [{ id: USER_1, tenant_id: TENANT_A }]);

    // Checkout records task_runs rows with an FK into ai.agent_run — seed the
    // real chain (thread → runs) instead of faking it.
    const thread = await db.schema("ai").from("thread").upsert(
      {
        agent_id: AGENT,
        created_by_user_id: USER_1,
        id: THREAD_1,
        tenant_id: TENANT_A,
      },
      { onConflict: "id" }
    );
    if (thread.error) {
      throw new Error(`thread seed failed: ${thread.error.message}`);
    }
    const runs = await db
      .schema("ai")
      .from("agent_run")
      .upsert(
        [
          {
            agent_id: AGENT,
            id: RUN_1,
            tenant_id: TENANT_A,
            thread_id: THREAD_1,
          },
          {
            agent_id: AGENT,
            id: RUN_2,
            tenant_id: TENANT_A,
            thread_id: THREAD_1,
          },
        ],
        { onConflict: "id" }
      );
    if (runs.error) {
      throw new Error(`agent_run seed failed: ${runs.error.message}`);
    }

    repoA = createTasksRepoSupabase(db, TENANT_A, SCOPE);
    repoB = createTasksRepoSupabase(db, TENANT_B, SCOPE);
  });

  afterAll(async () => {
    await cleanup();
  });

  it("creates tasks with persisted sequential tenant identifiers", async () => {
    const first = await repoA.createTask({ title: "Integration task one" });
    const second = await repoA.createTask({ title: "Integration task two" });

    expect(first.identifier).toMatch(/^[A-Z]+-\d+$/);
    const prefix = first.identifier.split("-")[0];
    const firstNumber = Number(first.identifier.split("-")[1]);
    expect(second.identifier).toBe(`${prefix}-${firstNumber + 1}`);
    expect(first.tenant_id).toBe(TENANT_A);
    expect(first.status).toBe("todo");

    const detail = await repoA.getTask(first.id);
    expect(detail?.title).toBe("Integration task one");
  });

  it("scopes reads to the repo tenant", async () => {
    const task = await repoA.createTask({ title: "Tenant A only" });

    await expect(repoB.getTask(task.id)).resolves.toBeNull();
    const listB = await repoB.listTasksPaginated({ page: 1, pageSize: 50 });
    expect(listB.data.map((row: Task) => row.id)).not.toContain(task.id);
  });

  it("checks out a task, is idempotent per run, and records the task run", async () => {
    const task = await repoA.createTask({ title: "Checkout target" });

    const checkedOut = await repoA.checkoutTask(task.id, {
      agent_session_run_id: RUN_1,
      agent_type_key: AGENT,
    });
    expect(checkedOut.status).toBe("in_progress");
    expect(checkedOut.primary_assignee_kind).toBe("agent");
    expect(checkedOut.checkout_run_id).toBe(RUN_1);

    // Same run again: idempotent, no conflict.
    const again = await repoA.checkoutTask(task.id, {
      agent_session_run_id: RUN_1,
      agent_type_key: AGENT,
    });
    expect(again.checkout_run_id).toBe(RUN_1);

    const runRows = await db
      .schema("module_tasks")
      .from("task_runs")
      .select("agent_session_run_id, role")
      .eq("task_id", task.id);
    expect(runRows.error).toBeNull();
    expect(runRows.data).toEqual([
      { agent_session_run_id: RUN_1, role: "checkout" },
    ]);
  });

  it("rejects a competing checkout from a live run with a conflict error", async () => {
    const task = await repoA.createTask({ title: "Contested task" });
    await repoA.checkoutTask(task.id, {
      agent_session_run_id: RUN_1,
      agent_type_key: AGENT,
    });

    await expect(
      repoA.checkoutTask(task.id, {
        agent_session_run_id: RUN_2,
        agent_type_key: AGENT,
      })
    ).rejects.toBeInstanceOf(TaskCheckoutConflictError);
  });

  it("releases a checked-out task back to todo", async () => {
    const task = await repoA.createTask({ title: "Release target" });
    await repoA.checkoutTask(task.id, {
      agent_session_run_id: RUN_1,
      agent_type_key: AGENT,
    });

    const released = await repoA.releaseTask(task.id, {
      agent_session_run_id: RUN_1,
    });
    expect(released?.status).toBe("todo");
    expect(released?.checkout_run_id).toBeNull();
  });

  it("cascades task data away when the tenant is deleted", async () => {
    const throwaway = "17a5c000-0000-4000-8000-00000000000c";
    const drop = await seedTenants(db, [{ id: throwaway }]);
    const repo = createTasksRepoSupabase(db, throwaway, SCOPE);
    const task = await repo.createTask({ title: "Doomed task" });

    await drop();

    const rows = await db
      .schema("module_tasks")
      .from("tasks")
      .select("id")
      .eq("id", task.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });
});
