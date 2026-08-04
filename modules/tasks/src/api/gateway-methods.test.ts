import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAgentKeyValidatorCache } from "./agent-key-validator.js";
import { registerTasksGatewayMethods } from "./gateway-methods.js";
import { defaultAuth, makeMockApi, makeMockTasksRepo } from "./test-helpers.js";

// Intercept fetch so tests never hit the network.
const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

function makeRegistryResponse(ids: string[]): Response {
  return {
    ok: true,
    json: async () => ({ agents: ids.map((id) => ({ id })) }),
  } as Response;
}

const AI_BASE_URL = "http://ai.test";
const AI_JWT = "service-jwt";
const VALID_KEY = "knowledge-base.manager";

describe("registerTasksGatewayMethods — agent key validation", () => {
  let repo: ReturnType<typeof makeMockTasksRepo>;
  let api: ReturnType<typeof makeMockApi>["api"];
  let serverOperations: ReturnType<typeof makeMockApi>["serverOperations"];

  beforeEach(() => {
    clearAgentKeyValidatorCache();
    mockFetch.mockReset();
    repo = makeMockTasksRepo();
    const mock = makeMockApi();
    api = mock.api;
    serverOperations = mock.serverOperations;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function getHandler(operationId: string) {
    const op = serverOperations.find((o) => o.operationId === operationId);
    if (!op) {
      throw new Error(`operation ${operationId} not found`);
    }
    return op.handler as (
      input: unknown,
      ctx: { auth: typeof defaultAuth }
    ) => Promise<unknown>;
  }

  it("tasks_create with valid agent key passes", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
    });

    const handler = getHandler("tasks_create");
    const result = await handler(
      {
        title: "Test task",
        primary_assignee_kind: "agent",
        primary_assignee_agent_type_key: VALID_KEY,
      },
      { auth: defaultAuth }
    );
    expect((result as { title: string }).title).toBe("Test task");
  });

  it("tasks_create with unknown agent key throws unknown_agent_type_key", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
    });

    const handler = getHandler("tasks_create");
    await expect(
      handler(
        {
          title: "Bad task",
          primary_assignee_kind: "agent",
          primary_assignee_agent_type_key: "nonexistent.agent",
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("unknown_agent_type_key");
  });

  it("tasks_create with primary_assignee_kind: user skips agent key check", async () => {
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
    });

    const handler = getHandler("tasks_create");
    const result = await handler(
      {
        title: "User task",
        primary_assignee_kind: "user",
        primary_assignee_user_id: "00000000-0000-4000-8000-000000000099",
      },
      { auth: defaultAuth }
    );
    expect((result as { title: string }).title).toBe("User task");
    // fetch must not have been called — no agent key check
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("tasks_create skips validation when options are not provided", async () => {
    registerTasksGatewayMethods(api, repo);

    const handler = getHandler("tasks_create");
    const result = await handler(
      {
        title: "No-validation task",
        primary_assignee_kind: "agent",
        primary_assignee_agent_type_key: "completely.fake",
      },
      { auth: defaultAuth }
    );
    expect((result as { title: string }).title).toBe("No-validation task");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("tasks_create throws agent_registry_unreachable when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
    });

    const handler = getHandler("tasks_create");
    await expect(
      handler(
        {
          title: "Unreachable task",
          primary_assignee_kind: "agent",
          primary_assignee_agent_type_key: VALID_KEY,
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("agent_registry_unreachable");
  });

  it("tasks_update with agent assignee change validates key", async () => {
    // First create a task without validation options, then re-register with options
    const baseRepo = makeMockTasksRepo();
    const task = await baseRepo.createTask({
      title: "Existing task",
      primary_assignee_kind: "none",
    });

    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    const mock2 = makeMockApi();
    registerTasksGatewayMethods(mock2.api, baseRepo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
    });
    const updateOp = mock2.serverOperations.find(
      (o) => o.operationId === "tasks_update"
    );
    const handler = updateOp!.handler as (
      input: unknown,
      ctx: { auth: typeof defaultAuth }
    ) => Promise<unknown>;

    await expect(
      handler(
        {
          id: task.id,
          primary_assignee_kind: "agent",
          primary_assignee_agent_type_key: "bad.agent",
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("unknown_agent_type_key");
  });
});

describe("approval grant store ops (D2 2d)", () => {
  function makeCoreGrantsFake(ops: string[]) {
    const calls: { listSubjects?: string[]; revoked?: string } = {};
    return {
      calls,
      factory: () => ({
        grant: async () => {
          // not exercised here
        },
        listBySubject: async () => ({ once: [], standing: ops }),
        listOperationIds: async (input: { subjectIds: string[] }) => {
          calls.listSubjects = input.subjectIds;
          return ops;
        },
        revoke: async () => {
          // not exercised here
        },
        revokeOnce: async (input: { subjectId: string }) => {
          calls.revoked = input.subjectId;
        },
      }),
    };
  }

  it("tasks_approval_grants_effective reads the core store, not the columns", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({
      title: "T",
      primary_assignee_kind: "none",
    });
    const core = makeCoreGrantsFake(["gmail_send", "contacts_delete"]);
    const mock = makeMockApi();
    registerTasksGatewayMethods(mock.api, repo, {
      coreGrantsFactory: core.factory,
    });
    const op = mock.serverOperations.find(
      (o) => o.operationId === "tasks_approval_grants_effective"
    );
    const result = (await (
      op!.handler as (input: unknown, ctx: unknown) => Promise<unknown>
    )({ id: task.id }, { auth: defaultAuth })) as {
      approval_grants: string[];
    };
    expect(result.approval_grants.sort()).toEqual([
      "contacts_delete",
      "gmail_send",
    ]);
    expect(core.calls.listSubjects).toEqual([task.id]);
  });

  it("tasks_clear_once_approvals also reaps the task's core once-grants", async () => {
    const repo = makeMockTasksRepo();
    const task = await repo.createTask({
      title: "T",
      primary_assignee_kind: "none",
    });
    const core = makeCoreGrantsFake([]);
    const mock = makeMockApi();
    registerTasksGatewayMethods(mock.api, repo, {
      coreGrantsFactory: core.factory,
    });
    const op = mock.serverOperations.find(
      (o) => o.operationId === "tasks_clear_once_approvals"
    );
    await (op!.handler as (input: unknown, ctx: unknown) => Promise<unknown>)(
      { id: task.id },
      { auth: defaultAuth }
    );
    expect(core.calls.revoked).toBe(task.id);
  });
});

/**
 * Capability elevation granted "for this goal" must not outlive the goal. The
 * reap existed as a DAL function with zero callers until 2026-08-04, so grants
 * lingered until their TTL — these pin that it actually fires now (TRK-03).
 */
describe("registerTasksGatewayMethods — goal grant reaping", () => {
  function setup() {
    const reaped: string[] = [];
    const repo = makeMockTasksRepo();
    const mock = makeMockApi();
    registerTasksGatewayMethods(mock.api, repo, {
      reapGoalGrants: (_auth, goalId) => {
        reaped.push(goalId);
        return Promise.resolve();
      },
    });
    const run = (operationId: string, input: unknown) => {
      const op = mock.serverOperations.find(
        (o) => o.operationId === operationId
      );
      if (!op) {
        throw new Error(`operation ${operationId} not found`);
      }
      return (op.handler as (i: unknown, c: unknown) => Promise<unknown>)(
        input,
        { auth: defaultAuth }
      );
    };
    return { reaped, repo, run };
  }

  it.each([
    "achieved",
    "cancelled",
  ] as const)("reaps when a goal becomes %s", async (status) => {
    const { reaped, repo, run } = setup();
    const goal = await repo.createGoal({ title: "G" });

    await run("goals_update", { id: goal.id, status });

    expect(reaped).toEqual([goal.id]);
  });

  it.each([
    "planned",
    "active",
  ] as const)("does not reap while a goal is still %s", async (status) => {
    const { reaped, repo, run } = setup();
    const goal = await repo.createGoal({ title: "G" });

    await run("goals_update", { id: goal.id, status });

    expect(reaped).toEqual([]);
  });

  it("reaps when a goal is deleted", async () => {
    const { reaped, repo, run } = setup();
    const goal = await repo.createGoal({ title: "G" });

    await run("goals_delete", { id: goal.id });

    expect(reaped).toEqual([goal.id]);
  });

  it("keeps the goal update when the reap fails", async () => {
    const repo = makeMockTasksRepo();
    const mock = makeMockApi();
    registerTasksGatewayMethods(mock.api, repo, {
      reapGoalGrants: () => Promise.reject(new Error("core unreachable")),
    });
    const goal = await repo.createGoal({ title: "G" });
    const op = mock.serverOperations.find(
      (o) => o.operationId === "goals_update"
    );

    const updated = (await (
      op!.handler as (i: unknown, c: unknown) => Promise<unknown>
    )({ id: goal.id, status: "achieved" }, { auth: defaultAuth })) as {
      status: string;
    };

    expect(updated.status).toBe("achieved");
  });
});
