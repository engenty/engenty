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
