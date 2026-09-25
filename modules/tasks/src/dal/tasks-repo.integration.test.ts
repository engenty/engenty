// The tasks repo against the real database: the rules the service tests take on
// faith from `makeMockTasksRepo`, proven on the code that runs in production.
//
// Skipped unless SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (a local
// stack), like the other *.integration.test.ts files. Each run creates its own
// tenant and deletes it afterwards — never relies on dev data.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTasksRepoSupabase } from "./supabase.js";

const URL = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const describeIfDb = URL && KEY ? describe : describe.skip;

describeIfDb("tasks repo against the database", () => {
  const client = createClient(URL ?? "http://unset", KEY ?? "unset", {
    auth: { persistSession: false },
  });
  const tenantId = randomUUID();
  const userId = randomUUID();
  let otherSpaceId = "";
  let repo: ReturnType<typeof createTasksRepoSupabase>;

  beforeAll(async () => {
    const core = client.schema("core");
    const tenant = await core.from("tenants").insert({
      id: tenantId,
      name: "Tasks integration",
      slug: `tasks-it-${tenantId.slice(0, 8)}`,
    });
    expect(tenant.error).toBeNull();
    const user = await core.from("users").insert({
      email: `tasks-it-${tenantId.slice(0, 8)}@example.test`,
      id: userId,
      tenant_id: tenantId,
    });
    expect(user.error).toBeNull();
    const space = await core
      .from("spaces")
      .insert({ key: "other", name: "Other", tenant_id: tenantId })
      .select("id")
      .single();
    expect(space.error).toBeNull();
    otherSpaceId = space.data?.id as string;
    repo = createTasksRepoSupabase(client, tenantId, "default");
  });

  afterAll(async () => {
    await client
      .schema("module_tasks")
      .from("tasks")
      .delete()
      .eq("tenant_id", tenantId);
    await client.schema("core").from("tenants").delete().eq("id", tenantId);
  });

  const checkout = (taskId: string, runId: string) =>
    repo.checkoutTask(taskId, {
      agent_session_run_id: runId,
      agent_type_key: "tasks.assist",
    });

  it("lets exactly one of two racing runs check a task out", async () => {
    const task = await repo.createTask({ title: "Race" });

    const results = await Promise.allSettled([
      checkout(task.id, randomUUID()),
      checkout(task.id, randomUUID()),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const loser = results.find((r) => r.status === "rejected");
    expect(String(loser?.reason)).toContain("task_checkout_conflict");
  });

  it("lets the holding run check out again, and release frees the task", async () => {
    const task = await repo.createTask({ title: "Resume" });
    const run = randomUUID();
    await checkout(task.id, run);

    const again = await checkout(task.id, run);
    expect(again).toMatchObject({
      checkout_run_id: run,
      status: "in_progress",
    });

    const released = await repo.releaseTask(task.id);
    expect(released).toMatchObject({ checkout_run_id: null, status: "todo" });
    await checkout(task.id, randomUUID());
  });

  it("stops an agent moving a task to in_progress without a checkout; a person can", async () => {
    const task = await repo.createTask({ title: "Start" });

    await expect(
      repo.updateTask(
        task.id,
        { status: "in_progress" },
        { actorKind: "agent" }
      )
    ).rejects.toThrow("task_checkout_required");

    const byPerson = await repo.updateTask(
      task.id,
      { status: "in_progress" },
      { actorKind: "user" }
    );
    expect(byPerson?.status).toBe("in_progress");
  });

  it("puts a new task in its parent's Space unless a Space is given", async () => {
    const parent = await repo.createTask({
      space_id: otherSpaceId,
      title: "Parent",
    });
    const plain = await repo.createTask({ title: "Plain" });

    const child = await repo.createTask({
      parent_id: parent.id,
      title: "Child",
    });
    const pinned = await repo.createTask({
      parent_id: parent.id,
      space_id: plain.space_id,
      title: "Pinned",
    });

    expect(plain.space_id).not.toBe(otherSpaceId);
    expect(child.space_id).toBe(otherSpaceId);
    expect(pinned.space_id).toBe(plain.space_id);
  });

  it("clears the agent key when a task is reassigned to a person", async () => {
    const task = await repo.createTask({
      primary_assignee_agent_type_key: "tasks.assist",
      primary_assignee_kind: "agent",
      title: "Handover",
    });

    await repo.updateTask(task.id, {
      primary_assignee_kind: "user",
      primary_assignee_user_id: userId,
    });

    expect(await repo.getTask(task.id)).toMatchObject({
      primary_assignee_agent_type_key: null,
      primary_assignee_kind: "user",
      primary_assignee_user_id: userId,
    });
  });
});
