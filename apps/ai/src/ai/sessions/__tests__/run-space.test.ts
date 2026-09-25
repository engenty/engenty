import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EngentyCoreHttpError,
  type EngentySpaceSurface,
} from "../../core-http-client.js";
import type { AiSessionScope } from "../types.js";

const { constructed, invokeTool, listSpaces, request } = vi.hoisted(() => ({
  constructed: [] as Record<string, unknown>[],
  invokeTool: vi.fn(),
  listSpaces: vi.fn(),
  request: vi.fn(),
}));

vi.mock("../../core-http-client.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../core-http-client.js")>();
  return {
    ...actual,
    getEngentyCoreBaseUrlFromEnv: () => "http://core.test",
    EngentyCoreClient: class MockEngentyCoreClient {
      constructor(options: Record<string, unknown>) {
        constructed.push(options);
      }
      invokeTool = invokeTool;
      listSpaces = listSpaces;
      request = request;
    },
  };
});

import {
  actingUserIdFromTask,
  applyAgentConnectorReach,
  candidateRunSpaceId,
  resetRunSpaceCachesForTests,
  resolvedRunSpace,
  resolveRunSpace,
  resolveRunSpaceById,
  resolveRunSpaceForThread,
  toolsSpaceFromResolution,
} from "../run-space.js";

const SPACE_A = "019fe8ec-0000-0000-0000-00000000000a";
const SPACE_B = "019fe8ec-0000-0000-0000-00000000000b";
const TENANT = "019fe8ec-0000-0000-0000-0000000000aa";
const USER = "019fe8ec-0000-0000-0000-0000000000bb";
const OWNER = "019fe8ec-0000-0000-0000-0000000000cc";
const TASK = "019fe8ec-0000-0000-0000-0000000000dd";

const userScope: AiSessionScope = {
  credential: { kind: "user", token: "user-token" },
  tenantId: TENANT,
  userId: USER,
};

const serviceScope: AiSessionScope = {
  credential: { kind: "service", token: "service-token" },
  tenantId: TENANT,
  userId: "00000000-0000-0000-0000-000000000000",
};

function surfaceFixture(
  overrides: Partial<EngentySpaceSurface> = {}
): EngentySpaceSurface {
  return {
    agents: ["tasks.assist"],
    capabilities: [],
    connections: ["conn-gmail"],
    connectors: ["google-gmail"],
    modules: [
      {
        agentAccess: "write",
        isRequired: false,
        moduleId: "projects",
        recordScope: "space",
      },
      {
        agentAccess: "read",
        isRequired: false,
        moduleId: "contacts",
        recordScope: "all",
      },
      {
        agentAccess: "none",
        isRequired: false,
        moduleId: "offers",
        recordScope: null,
      },
    ],
    skills: ["projects-management"],
    spaceId: SPACE_A,
    ...overrides,
  };
}

describe("candidateRunSpaceId", () => {
  it("prefers the thread's own column over the route context", () => {
    // The thread's column is the durable fact. A resumed run — an approval
    // landing hours later — carries a route context from whatever page the
    // browser is on NOW, which is not where the conversation lives.
    expect(
      candidateRunSpaceId({
        route_context: { scope: { space_id: SPACE_B } },
        space_id: SPACE_A,
      })
    ).toBe(SPACE_A);
  });

  it("falls back to the route context for a pre-space thread", () => {
    expect(
      candidateRunSpaceId({
        route_context: { scope: { space_id: SPACE_B } },
        space_id: null,
      })
    ).toBe(SPACE_B);
  });

  it("claims no space when neither says one", () => {
    expect(
      candidateRunSpaceId({ route_context: {}, space_id: null })
    ).toBeNull();
    expect(candidateRunSpaceId({})).toBeNull();
  });

  it("drops a non-uuid claim rather than passing it on", () => {
    expect(
      candidateRunSpaceId({
        route_context: { scope: { space_id: "marketing" } },
        space_id: null,
      })
    ).toBeNull();
  });
});

describe("resolveRunSpace", () => {
  beforeEach(() => {
    resetRunSpaceCachesForTests();
    constructed.length = 0;
    request.mockReset();
    invokeTool.mockReset();
    invokeTool.mockResolvedValue({
      connectors: [{ id: "google-gmail", tool_prefix: "gmail" }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns global when the thread claims no Space", async () => {
    const resolution = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: null },
    });
    expect(resolution).toEqual({ kind: "global" });
    expect(request).not.toHaveBeenCalled();
    expect(toolsSpaceFromResolution(resolution)).toBeNull();
  });

  it("puts the copilot where the person stands, its resources in /s/me", async () => {
    // Hiring, apps, routines, the computer and the browser are the Space the
    // person is in; the copilot's connections stay their personal Space's.
    listSpaces.mockResolvedValue([
      { id: SPACE_A, ownerUserId: null },
      { id: SPACE_B, ownerUserId: USER },
    ]);
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes(SPACE_B)
          ? surfaceFixture({ connectors: ["google-gmail"] })
          : surfaceFixture({
              browserGrant: { autostart: true, unattended: true },
              connectors: [],
            })
      )
    );
    const resolution = await resolveRunSpace({
      scope: userScope,
      thread: {
        agent_id: "engenty.copilot",
        route_context: { scope: { space_id: SPACE_A } },
        space_id: null,
      },
    });
    const space = resolvedRunSpace(resolution);
    expect(space?.spaceId).toBe(SPACE_A);
    expect(space?.resourceSpaceId).toBe(SPACE_B);
    expect([...(space?.connectorPrefixes ?? [])]).toEqual(["gmail"]);
    expect(space?.browser.unattended).toBe(true);
  });

  it("puts the copilot in /s/me when the person stands in no Space", async () => {
    listSpaces.mockResolvedValue([{ id: SPACE_B, ownerUserId: USER }]);
    request.mockResolvedValue(surfaceFixture());
    const resolution = await resolveRunSpace({
      scope: userScope,
      thread: { agent_id: "engenty.copilot", space_id: null },
    });
    const space = resolvedRunSpace(resolution);
    expect(space?.spaceId).toBe(SPACE_B);
    expect(space?.resourceSpaceId).toBeUndefined();
  });

  it("returns resolved for an open Space the caller can enter", async () => {
    request.mockResolvedValue(surfaceFixture());
    const resolution = await resolveRunSpace({
      runId: "run-1",
      scope: userScope,
      thread: { space_id: SPACE_A },
      threadId: "thread-1",
    });
    expect(resolution.kind).toBe("resolved");
    const space = resolvedRunSpace(resolution);
    expect(space?.spaceId).toBe(SPACE_A);
    expect(space?.moduleIds.has("projects")).toBe(true);
    expect(space?.moduleIds.has("contacts")).toBe(true);
    expect(space?.moduleIds.has("offers")).toBe(false);
    expect(space?.readOnlyModuleIds.has("contacts")).toBe(true);
    expect(space?.connectorPrefixes.has("gmail")).toBe(true);
    expect(space?.surface).toEqual(surfaceFixture());
    const toolsSpace = toolsSpaceFromResolution(resolution);
    expect(toolsSpace).toMatchObject({
      spaceId: SPACE_A,
    });
    expect(
      toolsSpace && !("kind" in toolsSpace)
        ? [...(toolsSpace.agentIds ?? [])]
        : []
    ).toEqual(["tasks.assist"]);
  });

  it("returns resolved for a private Space when the surface load succeeds", async () => {
    // Chat: the caller's token already passed requireSpaceAccess. Headless:
    // core may honor the task id + acting user on a server-resolved Space.
    request.mockResolvedValue(surfaceFixture({ spaceId: SPACE_A }));
    const resolution = await resolveRunSpaceById({
      actingUserId: OWNER,
      scope: serviceScope,
      spaceId: SPACE_A,
      taskId: TASK,
    });
    expect(resolution.kind).toBe("resolved");
    expect(constructed[0]).toMatchObject({
      spaceId: SPACE_A,
      taskId: TASK,
    });
    expect(request).toHaveBeenCalledWith(`/api/spaces/${SPACE_A}/surface`, {
      headers: { "x-engenty-acting-for-user-id": OWNER },
    });
  });

  it("returns unresolved forbidden when core refuses the claimed Space", async () => {
    request.mockRejectedValue(
      new EngentyCoreHttpError("forbidden", 403, "forbidden")
    );
    const resolution = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: SPACE_A },
    });
    expect(resolution).toEqual({
      claimed_space_id: SPACE_A,
      kind: "unresolved",
      reason: "forbidden",
    });
    expect(toolsSpaceFromResolution(resolution)).toEqual({
      claimed_space_id: SPACE_A,
      kind: "unresolved",
      reason: "forbidden",
    });
  });

  it("returns unresolved not_found when the claimed Space is deleted", async () => {
    request.mockRejectedValue(
      new EngentyCoreHttpError("Space not found", 404, "not_found")
    );
    const resolution = await resolveRunSpaceById({
      scope: serviceScope,
      spaceId: SPACE_A,
      taskId: TASK,
    });
    expect(resolution).toEqual({
      claimed_space_id: SPACE_A,
      kind: "unresolved",
      reason: "not_found",
    });
    expect(resolvedRunSpace(resolution)).toBeUndefined();
  });

  it("returns unresolved unavailable when core cannot be reached", async () => {
    request.mockRejectedValue(
      new EngentyCoreHttpError("Core request timed out", 0, "network_error")
    );
    const resolution = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: SPACE_A },
    });
    expect(resolution).toEqual({
      claimed_space_id: SPACE_A,
      kind: "unresolved",
      reason: "unavailable",
    });
  });

  it("returns unresolved unavailable when the run has no credential", async () => {
    const resolution = await resolveRunSpace({
      scope: { tenantId: TENANT, userId: USER },
      thread: { space_id: SPACE_A },
    });
    expect(resolution).toEqual({
      claimed_space_id: SPACE_A,
      kind: "unresolved",
      reason: "unavailable",
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("honours a cached surface until TTL, then reflects a removed mount", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T10:00:00.000Z"));
    request.mockResolvedValueOnce(surfaceFixture());
    const first = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: SPACE_A },
    });
    expect(resolvedRunSpace(first)?.moduleIds.has("projects")).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    request.mockResolvedValueOnce(
      surfaceFixture({
        modules: [
          {
            agentAccess: "read",
            isRequired: false,
            moduleId: "contacts",
            recordScope: "all",
          },
        ],
      })
    );
    const cached = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: SPACE_A },
    });
    expect(resolvedRunSpace(cached)?.moduleIds.has("projects")).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-08-21T10:00:31.000Z"));
    const refreshed = await resolveRunSpace({
      scope: userScope,
      thread: { space_id: SPACE_A },
    });
    expect(resolvedRunSpace(refreshed)?.moduleIds.has("projects")).toBe(false);
    expect(resolvedRunSpace(refreshed)?.moduleIds.has("contacts")).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not treat a missing thread as a claimed Space", async () => {
    const resolution = await resolveRunSpaceForThread({
      scope: userScope,
      store: {
        getThread: async () => null,
      },
      threadId: "thread-missing",
    });
    expect(resolution).toEqual({ kind: "global" });
  });
});

describe("actingUserIdFromTask", () => {
  it("prefers owner, then creator, then human assignee", () => {
    expect(
      actingUserIdFromTask({
        created_by_user_id: USER,
        owner_user_id: OWNER,
        primary_assignee_user_id: "019fe8ec-0000-0000-0000-0000000000ee",
      })
    ).toBe(OWNER);
    expect(actingUserIdFromTask({ created_by_user_id: USER })).toBe(USER);
    expect(
      actingUserIdFromTask({
        primary_assignee_user_id: USER,
      })
    ).toBe(USER);
    expect(actingUserIdFromTask({})).toBeUndefined();
  });
});

describe("applyAgentConnectorReach", () => {
  const all = new Set(["gmail", "gdrive", "slack"]);

  function resolvedSpace() {
    return toolsSpaceFromResolution({
      kind: "resolved",
      space: {
        agentIds: new Set(),
        allConnectorPrefixes: all,
        browser: { autostart: false, unattended: false },
        connectorPrefixes: new Set(["gdrive", "slack"]),
        moduleIds: new Set(),
        readOnlyModuleIds: new Set(),
        spaceId: SPACE_A,
        surface: surfaceFixture(),
        topLevelAgentIds: new Set(),
      },
    });
  }

  function prefixes(next: ReturnType<typeof applyAgentConnectorReach>) {
    return next && "connectorPrefixes" in next
      ? [...(next.connectorPrefixes ?? [])].sort()
      : [];
  }

  it("gives an agent with no preference everything the space enables", () => {
    const next = applyAgentConnectorReach({
      allConnectorPrefixes: all,
      preferredPrefixes: new Set(),
      space: resolvedSpace(),
    });
    expect(prefixes(next)).toEqual(["gdrive", "slack"]);
  });

  it("narrows to the agent's preferred list, never beyond the space", () => {
    const next = applyAgentConnectorReach({
      allConnectorPrefixes: all,
      preferredPrefixes: new Set(["gmail", "slack"]),
      space: resolvedSpace(),
    });
    expect(prefixes(next)).toEqual(["slack"]);
  });

  it("gives a run with no space no connector at all", () => {
    const next = applyAgentConnectorReach({
      allConnectorPrefixes: all,
      preferredPrefixes: new Set(["gmail"]),
      space: null,
    });
    expect(next && "kind" in next && next.kind === "global").toBe(true);
    expect(prefixes(next)).toEqual([]);
  });
});
