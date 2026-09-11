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
const SPACE_ID = "00000000-0000-4000-8000-000000000010";

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

  it("tasks_list filters by primary agent type key", async () => {
    await repo.createTask({
      title: "Research",
      primary_assignee_agent_type_key: VALID_KEY,
      primary_assignee_kind: "agent",
    });
    await repo.createTask({
      title: "Other",
      primary_assignee_agent_type_key: "other.agent",
      primary_assignee_kind: "agent",
    });
    registerTasksGatewayMethods(api, repo);

    const result = (await getHandler("tasks_list")(
      { primary_assignee_agent_type_key: VALID_KEY },
      { auth: defaultAuth }
    )) as { data: Array<{ title: string }> };

    expect(result.data.map((task) => task.title)).toEqual(["Research"]);
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

  it("allows a mounted Space assignment", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    const resolveSpaceAgentMount = vi.fn(async () => "mounted" as const);
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount,
    });

    await expect(
      getHandler("tasks_create")(
        {
          primary_assignee_agent_type_key: VALID_KEY,
          primary_assignee_kind: "agent",
          space_id: SPACE_ID,
          title: "Mounted",
        },
        { auth: defaultAuth }
      )
    ).resolves.toMatchObject({ title: "Mounted" });
    expect(resolveSpaceAgentMount).toHaveBeenCalledWith({
      agentTypeKey: VALID_KEY,
      spaceId: SPACE_ID,
      tenantId: defaultAuth.tenantId,
    });
  });

  it("rejects an unmounted Space assignment without exposing ids", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount: async () => "agent_not_mounted",
    });

    const error = await getHandler("tasks_create")(
      {
        primary_assignee_agent_type_key: VALID_KEY,
        primary_assignee_kind: "agent",
        space_id: SPACE_ID,
        title: "Unmounted",
      },
      { auth: defaultAuth }
    ).catch((caught: unknown) => caught);
    expect(error).toEqual(new Error("agent_not_mounted"));
  });

  it("keeps intentional tenant-global assignment on registry validation", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    const resolveSpaceAgentMount = vi.fn(async () => "mounted" as const);
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount,
    });

    await getHandler("tasks_create")(
      {
        primary_assignee_agent_type_key: VALID_KEY,
        primary_assignee_kind: "agent",
        title: "Global",
      },
      { auth: defaultAuth }
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(resolveSpaceAgentMount).not.toHaveBeenCalled();
  });

  it("fails a claimed but unresolved Space closed", async () => {
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount: async () => "space_context_unresolved",
    });

    await expect(
      getHandler("tasks_create")(
        {
          primary_assignee_agent_type_key: VALID_KEY,
          primary_assignee_kind: "agent",
          space_id: SPACE_ID,
          title: "Unresolved",
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("space_context_unresolved");
  });

  it("rejects an update that assigns an unmounted agent", async () => {
    const task = await repo.createTask({
      primary_assignee_kind: "none",
      space_id: SPACE_ID,
      title: "Existing",
    });
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount: async () => "agent_not_mounted",
    });

    await expect(
      getHandler("tasks_update")(
        {
          id: task.id,
          primary_assignee_agent_type_key: VALID_KEY,
          primary_assignee_kind: "agent",
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("agent_not_mounted");
  });

  it("rejects checkout by an unmounted agent", async () => {
    const task = await repo.createTask({
      primary_assignee_agent_type_key: VALID_KEY,
      primary_assignee_kind: "agent",
      space_id: SPACE_ID,
      title: "Checkout",
    });
    mockFetch.mockResolvedValueOnce(makeRegistryResponse([VALID_KEY]));
    registerTasksGatewayMethods(api, repo, {
      aiBaseUrl: AI_BASE_URL,
      aiServiceJwt: AI_JWT,
      resolveSpaceAgentMount: async () => "agent_not_mounted",
    });

    await expect(
      getHandler("tasks_checkout")(
        {
          agent_session_run_id: "00000000-0000-4000-8000-000000000030",
          agent_type_key: VALID_KEY,
          id: task.id,
        },
        { auth: defaultAuth }
      )
    ).rejects.toThrow("agent_not_mounted");
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
