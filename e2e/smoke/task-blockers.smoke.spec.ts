import { type APIResponse, expect, test } from "@playwright/test";
import { apiAccessToken, gotoLoggedIn, uniqueName } from "../helpers";

// Some task routes return the raw object (create → `new Response(...)`), others
// go through the success envelope (`{ data: ... }`). Unwrap either shape.
function unwrap<T = Record<string, unknown>>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

// Agent coordination Phase 1: the task dependency graph, exercised end to end
// through the live core API (UI 5173 → Vite proxy → core 8787 → local Supabase).
// Covers blocker persistence, invalid-graph rejection (self-block / unknown id),
// and the parent "All subtasks are complete." wake — none of which needs the
// agent runtime, so the assertions stay deterministic.
test("task dependency graph: blockers persist, invalid graphs rejected, parent wakes on children done", async ({
  page,
}) => {
  // Login + several sequential API round-trips + a wake poll; on a cold stack
  // (first-load session race, first-request route compile) 60s is tight.
  test.slow();
  await gotoLoggedIn(page, "/mdl/tasks/list");
  const token = await apiAccessToken(page);
  const api = page.request;
  const auth = { Authorization: `Bearer ${token}` };

  const created: string[] = [];
  const create = async (
    body: Record<string, unknown>
  ): Promise<{ id: string; blocked_by_task_ids: string[] }> => {
    const res = await api.post("/api/tasks", { data: body, headers: auth });
    expect(res.status(), await res.text()).toBe(201);
    const task = unwrap<{ id: string; blocked_by_task_ids: string[] }>(
      await res.json()
    );
    created.push(task.id);
    return task;
  };

  try {
    // 1) A blocker set survives create → read-back.
    const a = await create({ title: uniqueName("Blocker A") });
    const b = await create({
      blocked_by_task_ids: [a.id],
      title: uniqueName("Dependent B"),
    });
    expect(b.blocked_by_task_ids).toEqual([a.id]);

    const getB = await api.get(`/api/tasks/${b.id}`, { headers: auth });
    expect(getB.ok()).toBeTruthy();
    expect(
      unwrap<{ blocked_by_task_ids: string[] }>(await getB.json())
        .blocked_by_task_ids
    ).toContain(a.id);

    // 2) Self-block is rejected by validateBlockedBy (400, not persisted).
    const selfBlock = await api.patch(`/api/tasks/${a.id}`, {
      data: { blocked_by_task_ids: [a.id] },
      headers: auth,
    });
    expect(selfBlock.status()).toBe(400);

    // 3) An unknown blocker id is rejected too.
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const badCreate = await api.post("/api/tasks", {
      data: {
        blocked_by_task_ids: [unknownId],
        title: uniqueName("Bad dep"),
      },
      headers: auth,
    });
    expect(badCreate.status()).toBe(400);

    // 4) Parent wakes once every child is terminal: the coordinator comments
    //    "All subtasks are complete." on the parent after the child → done.
    const parent = await create({ title: uniqueName("Parent") });
    const child = await create({
      parent_id: parent.id,
      title: uniqueName("Child"),
    });
    const done = await api.patch(`/api/tasks/${child.id}`, {
      data: { status: "done" },
      headers: auth,
    });
    expect(done.ok(), await done.text()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const res: APIResponse = await api.get(`/api/tasks/${parent.id}`, {
            headers: auth,
          });
          if (!res.ok()) {
            return "";
          }
          const detail = unwrap<{ comments?: Array<{ content: string }> }>(
            await res.json()
          );
          return (detail.comments ?? []).map((c) => c.content).join("\n");
        },
        { timeout: 15_000 }
      )
      .toContain("All subtasks are complete.");
  } finally {
    // Best-effort teardown, children before parents (reverse creation order).
    for (const id of created.reverse()) {
      await api.delete(`/api/tasks/${id}`, { headers: auth }).catch(() => {
        // Ignore teardown failures — the smoke DB is disposable.
      });
    }
  }
});
