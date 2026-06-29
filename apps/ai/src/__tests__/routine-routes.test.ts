import {
  registerAiRegistration,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { Hono } from "hono";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const invoke = vi.fn(async () => ({ id: "task-1" }));
vi.mock("../ai/sessions/task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));

const { registerRoutineRoutes } = await import("../api/routine-routes.js");

const TEST_MODULE_ID = "test-routines-module";
const CUSTOM_UUID = "0b9f3a52-7c1d-4e2a-9f3b-1a2b3c4d5e6f";

function createScopeResolver() {
  return async () => ({
    ok: true as const,
    scope: {
      tenantId: "tenant-1",
      userId: "user-1",
      isSuperAdmin: false,
      isTenantAdmin: true,
      tenantRole: "admin",
      userAccessToken: "token",
    },
  });
}

interface FakeDbState {
  customRoutines?: Record<string, unknown>[];
  stateRows: Record<string, unknown>[];
  threadRows?: Record<string, unknown>[];
}

/** Minimal supabase-shaped fake covering routine_state list/upsert + thread scan. */
function createFakeDb(state: FakeDbState) {
  const customRoutines = state.customRoutines ?? [];
  const routineStateTable = {
    select: () => ({
      eq: async () => ({ data: state.stateRows, error: null }),
    }),
    upsert: (row: Record<string, unknown>) => {
      const existingIndex = state.stateRows.findIndex(
        (r) => r.routine_id === row.routine_id
      );
      const merged =
        existingIndex >= 0
          ? { ...state.stateRows[existingIndex], ...row }
          : {
              enabled: true,
              last_result: null,
              last_run_at: null,
              schedule_override: null,
              ...row,
            };
      if (existingIndex >= 0) {
        state.stateRows[existingIndex] = merged;
      } else {
        state.stateRows.push(merged);
      }
      const result = { data: merged, error: null };
      const thenable = Promise.resolve(result) as Promise<typeof result> & {
        select: () => { single: () => Promise<typeof result> };
      };
      thenable.select = () => ({ single: async () => result });
      return thenable;
    },
    delete: () => ({
      eq: () => ({
        eq: async () => {
          state.stateRows = [];
          return { error: null };
        },
      }),
    }),
  };
  const customRoutineTable = {
    select: () => {
      const result = { data: customRoutines, error: null };
      const thenable = Promise.resolve(result) as Promise<typeof result> & {
        eq: (k: string, v: any) => Promise<typeof result>;
        single: () => Promise<typeof result>;
      };
      thenable.eq = async () => result;
      thenable.single = async () => ({
        data: customRoutines[0] ?? null,
        error: null,
      });
      return thenable;
    },
    insert: (row: Record<string, unknown>) => {
      const newRow = { id: CUSTOM_UUID, ...row };
      customRoutines.push(newRow);
      const result = { data: newRow, error: null };
      const thenable = Promise.resolve(result) as Promise<typeof result> & {
        select: () => { single: () => Promise<typeof result> };
      };
      thenable.select = () => ({ single: async () => result });
      return thenable;
    },
    update: (patch: Record<string, unknown>) => {
      if (customRoutines[0]) {
        Object.assign(customRoutines[0], patch);
      }
      const result = { data: customRoutines[0], error: null };
      const thenable = Promise.resolve(result) as Promise<typeof result> & {
        eq: () => {
          eq: () => { select: () => { single: () => Promise<typeof result> } };
        };
      };
      thenable.eq = () => ({
        eq: () => ({
          select: () => ({
            single: async () => result,
          }),
        }),
      });
      return thenable;
    },
    delete: () => ({
      eq: () => ({
        eq: async () => {
          customRoutines.length = 0;
          return { error: null };
        },
      }),
    }),
  };
  // ai.thread scan: the routines list awaits `.eq(...)` directly (session-key map),
  // the cleanup executor chains `.not(...)` — the eq result must serve both.
  const threadTable = {
    select: () => ({
      eq: () => {
        const result = { data: state.threadRows ?? [], error: null };
        const thenable = Promise.resolve(result) as Promise<typeof result> & {
          not: () => Promise<typeof result>;
        };
        thenable.not = async () => result;
        return thenable;
      },
    }),
  };
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === "routine_state") {
          return routineStateTable;
        }
        if (table === "custom_routine") {
          return customRoutineTable;
        }
        return threadTable;
      },
    }),
  } as any;
}

function makeHarness(sessionStatus = "idle") {
  return {
    sessions: {
      appendMessage: vi.fn(async () => ({ message: { id: "m1" } })),
      createSession: vi.fn(async () => ({
        session: { id: "thread-r1", status: sessionStatus },
      })),
    },
  } as any;
}

function buildApp(db: any, harness = makeHarness()) {
  const app = new Hono();
  registerRoutineRoutes(app, {
    getDb: () => db,
    harness,
    runStore: null,
    scopeResolver: createScopeResolver() as any,
    getRegistry: () => ({
      getAgentConfig: async (agentId: string) => {
        if (agentId === "test.agent" || agentId === "tasks.assist") {
          return { id: agentId };
        }
        return null;
      },
    }),
  });
  return { app, harness };
}

beforeAll(() => {
  registerAiRegistration({
    module_id: TEST_MODULE_ID,
    routines: [
      {
        enabled_by_default: true,
        id: "test.hourly-task",
        module_id: TEST_MODULE_ID,
        name: "Hourly task",
        schedule: "0 * * * *",
        target: {
          kind: "task_template",
          task_template: { agent_type_key: "test.agent", title: "Hourly" },
        },
      },
      {
        enabled_by_default: true,
        id: "test.make-task",
        module_id: TEST_MODULE_ID,
        name: "Make task",
        schedule: "0 * * * *",
        target: {
          kind: "task_template",
          task_template: { agent_type_key: "test.agent", title: "Weekly" },
        },
      },
      {
        enabled_by_default: false,
        id: "test.disabled",
        module_id: TEST_MODULE_ID,
        name: "Disabled by default",
        schedule: "* * * * *",
        target: {
          kind: "task_template",
          task_template: { agent_type_key: "test.agent", title: "Never" },
        },
      },
    ],
  });
});

afterAll(() => {
  unregisterAiRegistration(TEST_MODULE_ID);
});

beforeEach(() => {
  invoke.mockClear();
});

describe("routines API", () => {
  it("GET lists builtin + module routines with effective enabled flags", async () => {
    const { app } = buildApp(createFakeDb({ stateRows: [] }));
    const res = await app.request("/ai/v1/routines");
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.routines.map((r: { id: string }) => r.id);
    expect(ids).toContain("test.hourly-task");
    expect(ids).toContain("test.make-task");
    // System jobs are not routines — excluded from the list.
    expect(ids).not.toContain("engenty-ai.cleanup-interrupts");
    const disabled = body.routines.find(
      (r: { id: string }) => r.id === "test.disabled"
    );
    expect(disabled.enabled).toBe(false);
  });

  it("GET excludes system jobs (cleanup)", async () => {
    const { app } = buildApp(createFakeDb({ stateRows: [] }));
    const body = await (await app.request("/ai/v1/routines")).json();
    const ids = body.routines.map((r: { id: string }) => r.id);
    expect(ids).not.toContain("engenty-ai.cleanup-interrupts");
  });

  it("tick executes due task routines + system jobs", async () => {
    const db = createFakeDb({ stateRows: [] });
    const { app } = buildApp(db);
    const res = await app.request("/ai/v1/routines/tick", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await res.json();
    const executedIds = body.executed.map(
      (e: { routine_id: string }) => e.routine_id
    );
    // Due (never run): both enabled task routines + the cleanup system job.
    expect(executedIds).toContain("test.hourly-task");
    expect(executedIds).toContain("test.make-task");
    expect(executedIds).toContain("engenty-ai.cleanup-interrupts");
    expect(executedIds).not.toContain("test.disabled");
    // task_template routines → tasks_create.
    expect(invoke).toHaveBeenCalledWith(
      "tasks_create",
      expect.objectContaining({ primary_assignee_kind: "agent" })
    );
  });

  it("tick skips routines already run for the current slot", async () => {
    const now = new Date();
    const db = createFakeDb({
      stateRows: [
        {
          enabled: true,
          last_result: "ok",
          last_run_at: now.toISOString(),
          routine_id: "test.hourly-task",
          schedule_override: null,
          tenant_id: "tenant-1",
        },
      ],
    });
    const { app } = buildApp(db);
    const res = await app.request("/ai/v1/routines/tick", { method: "POST" });
    const body = await res.json();
    const executedIds = body.executed.map(
      (e: { routine_id: string }) => e.routine_id
    );
    expect(executedIds).not.toContain("test.hourly-task");
  });

  it("PATCH state disables a routine; next tick skips it", async () => {
    const db = createFakeDb({ stateRows: [] });
    const { app } = buildApp(db);
    const patch = await app.request("/ai/v1/routines/test.hourly-task/state", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
      headers: { "content-type": "application/json" },
    });
    expect(patch.status).toBe(200);
    const tick = await app.request("/ai/v1/routines/tick", { method: "POST" });
    const body = await tick.json();
    const executedIds = body.executed.map(
      (e: { routine_id: string }) => e.routine_id
    );
    expect(executedIds).not.toContain("test.hourly-task");
  });

  it("PATCH unknown routine → 404; run-now executes one routine", async () => {
    const db = createFakeDb({ stateRows: [] });
    const { app } = buildApp(db);
    const missing = await app.request("/ai/v1/routines/nope.missing/state", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
      headers: { "content-type": "application/json" },
    });
    expect(missing.status).toBe(404);

    const run = await app.request("/ai/v1/routines/test.make-task/run", {
      method: "POST",
    });
    expect(run.status).toBe(200);
    const body = await run.json();
    expect(body.result).toContain("task task-1 created");
  });

  it("CRUD custom routines", async () => {
    const dbState = { stateRows: [], customRoutines: [] };
    const db = createFakeDb(dbState);
    const { app } = buildApp(db);

    // 1. Create custom routine
    const createRes = await app.request("/ai/v1/routines/custom", {
      method: "POST",
      body: JSON.stringify({
        name: "My custom routine",
        agent_id: "test.agent",
        prompt: "Check emails",
        schedules: ["0 9 * * *"],
      }),
      headers: { "content-type": "application/json" },
    });
    expect(createRes.status).toBe(200);
    const createBody = await createRes.json();
    expect(createBody.routine.name).toBe("My custom routine");
    expect(dbState.customRoutines.length).toBe(1);

    // 2. GET lists custom routine
    const getRes = await app.request("/ai/v1/routines");
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    const customRoutine = getBody.routines.find(
      (r: any) => r.id === `custom:${CUSTOM_UUID}`
    );
    expect(customRoutine).toBeDefined();
    expect(customRoutine.name).toBe("My custom routine");
    expect(customRoutine.source).toBe("custom");

    // 3. Patch custom routine
    const patchRes = await app.request(
      `/ai/v1/routines/custom/${CUSTOM_UUID}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated custom routine",
        }),
        headers: { "content-type": "application/json" },
      }
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.routine.name).toBe("Updated custom routine");

    // 4. Delete custom routine
    const deleteRes = await app.request(
      `/ai/v1/routines/custom/${CUSTOM_UUID}`,
      {
        method: "DELETE",
      }
    );
    expect(deleteRes.status).toBe(200);
    expect(dbState.customRoutines.length).toBe(0);
  });

  it("custom CRUD accepts registry-prefixed ids (custom:<uuid>)", async () => {
    const dbState = {
      stateRows: [],
      customRoutines: [
        { id: CUSTOM_UUID, name: "Prefixed", agent_id: "test.agent" },
      ],
    };
    const { app } = buildApp(createFakeDb(dbState));

    const patchRes = await app.request(
      `/ai/v1/routines/custom/${encodeURIComponent(`custom:${CUSTOM_UUID}`)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed via prefixed id" }),
        headers: { "content-type": "application/json" },
      }
    );
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.routine.name).toBe("Renamed via prefixed id");

    const deleteRes = await app.request(
      `/ai/v1/routines/custom/${encodeURIComponent(`custom:${CUSTOM_UUID}`)}`,
      { method: "DELETE" }
    );
    expect(deleteRes.status).toBe(200);
    expect(dbState.customRoutines.length).toBe(0);
  });

  it("custom CRUD rejects malformed ids with 404", async () => {
    const { app } = buildApp(
      createFakeDb({ stateRows: [], customRoutines: [] })
    );
    const patchRes = await app.request("/ai/v1/routines/custom/not-a-uuid", {
      method: "PATCH",
      body: JSON.stringify({ name: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.request(
      "/ai/v1/routines/custom/custom%3Anot-a-uuid",
      { method: "DELETE" }
    );
    expect(deleteRes.status).toBe(404);
  });
});
