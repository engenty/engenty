// agent_remove: a custom (hired) specialist is deleted; a module agent is only
// unmounted from this Space. Every removal waits for a person to approve a card.

import { afterEach, describe, expect, it, vi } from "vitest";
import { resetFrontendToolSuspendSlotsForTests } from "../../ai/frontend-tools/frontend-tool-suspend-lock.js";
import { createAgentRemoveTool } from "../../ai/tools/agent-remove-tool.js";
import { engentyToolsRunAls } from "../../ai/tools/engenty-tools/lib/run-context.js";
import { deleteRegistryAgent } from "../ai/registry/delete-agent.js";
import { listPublishedWorkflowsRunningAgent } from "../ai/workflows/graph-agents.js";

vi.mock("../ai/registry/delete-agent.js", () => ({
  deleteRegistryAgent: vi.fn(async () => ({ deleted: true, ok: true })),
  listAgentDeletionFootprint: vi.fn(async () => ({
    routines: [{ id: "r-1", name: "Morning mail briefing" }],
    workflows: [{ id: "w-1", name: "Mail digest" }],
  })),
  listAgentRoutinesInSpace: vi.fn(async () => [
    { id: "r-2", name: "Nightly contact sync" },
  ]),
  listSpacesMountingAgent: vi.fn(async () => [
    { id: "space-1", name: "Office" },
  ]),
}));

vi.mock("../ai/workflows/graph-agents.js", () => ({
  listPublishedWorkflowsRunningAgent: vi.fn(async () => []),
}));

vi.mock("../ai/sessions/run-space.js", () => ({
  invalidateRunSpaceSurface: vi.fn(),
}));

const deleteAgent = vi.mocked(deleteRegistryAgent);
const referencing = vi.mocked(listPublishedWorkflowsRunningAgent);

const SPACE_ID = "00000000-0000-4000-8000-000000000010";
const CUSTOM = "mail.briefing";
const MODULE_AGENT = "contacts.manager";

const agents: Record<string, Record<string, unknown>> = {
  [CUSTOM]: {
    id: CUSTOM,
    kind: "specialist",
    name: "Mail Briefing Assistant",
    source: "database",
  },
  [MODULE_AGENT]: {
    id: MODULE_AGENT,
    kind: "specialist",
    name: "Contacts Manager",
    source: "module",
  },
  "engenty.copilot": {
    id: "engenty.copilot",
    kind: "interface",
    name: "Engenty Copilot",
    source: "builtin",
  },
  "tasks.assist": {
    id: "tasks.assist",
    kind: "delegated",
    name: "Tasks Assist",
    source: "module",
  },
};

const resolveAgent = vi.fn(async (id: string) => agents[id] ?? null);

function makeStore() {
  return { deleteAgent: vi.fn(async () => true) };
}

const core = {
  deleteSpaceMount: vi.fn(async () => ({ removed: true })),
  listSpaceMounts: vi.fn(),
  listSpaces: vi.fn(),
};

function makeTool(store = makeStore()) {
  return createAgentRemoveTool({
    core: () => core as never,
    registry: () => store as never,
    resolveAgent: resolveAgent as never,
  });
}

function space(overrides: Record<string, unknown> = {}) {
  return {
    agentIds: new Set([
      CUSTOM,
      MODULE_AGENT,
      "engenty.copilot",
      "tasks.assist",
      "office.lead",
    ]),
    allConnectorPrefixes: new Set<string>(),
    connectorPrefixes: new Set<string>(),
    moduleIds: new Set<string>(),
    readOnlyModuleIds: new Set<string>(),
    spaceId: SPACE_ID,
    topLevelAgentIds: new Set(["office.lead"]),
    ...overrides,
  };
}

function runCtx(overrides: Record<string, unknown> = {}) {
  return {
    accessToken: "tok-123",
    agentTypeKey: "office.lead",
    canSuspendForInteraction: true,
    coreBaseUrl: "https://api.example.com",
    orchestratorThreadId: "thread-1",
    space: space(),
    tenantId: "tenant-1",
    ...overrides,
  };
}

type Result =
  | {
      code?: string;
      ok: boolean;
      status?: string;
    }
  | undefined;

function execute(
  tool: ReturnType<typeof makeTool>,
  ctx: Record<string, unknown>,
  agent: Record<string, unknown>,
  agentId = CUSTOM
) {
  return engentyToolsRunAls.run(ctx as never, () =>
    tool.execute!({ agent_id: agentId } as never, { agent } as never)
  ) as Promise<Result>;
}

interface CardArtifact {
  artifact_type: string;
  choices: Array<{ id: string }>;
}

function cardOf(suspend: ReturnType<typeof vi.fn>): CardArtifact {
  return suspend.mock.calls.at(0)?.at(0) as CardArtifact;
}

afterEach(() => {
  vi.clearAllMocks();
  resetFrontendToolSuspendSlotsForTests();
});

describe("agent_remove — custom specialist", () => {
  it("always suspends on a Delete card, even where approvals are automatic", async () => {
    const suspend = vi.fn(async () => undefined);
    await execute(
      makeTool(),
      runCtx({ approvalGrants: ["*"], approvalPolicy: "suspend" }),
      { suspend }
    );

    expect(suspend).toHaveBeenCalledOnce();
    const artifact = cardOf(suspend);
    expect(artifact.artifact_type).toBe("decision");
    expect(artifact.choices.map((choice) => choice.id)).toEqual([
      "approve",
      "reject",
    ]);
    expect(deleteAgent).not.toHaveBeenCalled();
  });

  it("deletes nothing when the card is declined", async () => {
    const result = await execute(makeTool(), runCtx(), {
      resumeData: { choice_id: "reject" },
    });

    expect(result?.ok).toBe(true);
    expect(result?.status).toBe("declined");
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(core.deleteSpaceMount).not.toHaveBeenCalled();
  });

  it("deletes the agent in the caller's tenant on Approve and drops it from the run", async () => {
    const ctx = runCtx();
    const result = await execute(makeTool(), ctx, {
      resumeData: { choice_id: "approve" },
    });

    expect(result?.status).toBe("deleted");
    expect(deleteAgent).toHaveBeenCalledWith(
      { agentId: CUSTOM, tenantId: "tenant-1" },
      expect.anything()
    );
    expect((ctx.space.agentIds as Set<string>).has(CUSTOM)).toBe(false);
  });

  it("refuses while other people's published workflows still run the agent", async () => {
    referencing.mockResolvedValueOnce([{ id: "w-9", name: "Weekly report" }]);
    const suspend = vi.fn(async () => undefined);
    const result = await execute(makeTool(), runCtx(), { suspend });

    expect(result?.code).toBe("agent_remove_referenced");
    expect(suspend).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
  });
});

describe("agent_remove — module agent", () => {
  it("unmounts from this Space only on Approve, leaving the registry row", async () => {
    const store = makeStore();
    const ctx = runCtx();
    const result = await execute(
      makeTool(store),
      ctx,
      { resumeData: { choice_id: "approve" } },
      MODULE_AGENT
    );

    expect(result?.ok).toBe(true);
    expect(result?.status).toBe("unmounted");
    expect(core.deleteSpaceMount).toHaveBeenCalledWith(
      SPACE_ID,
      "agent",
      MODULE_AGENT
    );
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(store.deleteAgent).not.toHaveBeenCalled();
    expect((ctx.space.agentIds as Set<string>).has(MODULE_AGENT)).toBe(false);
  });
});

describe("agent_remove — refusals", () => {
  it("refuses when the run cannot park on a card", async () => {
    const suspend = vi.fn(async () => undefined);
    for (const agentId of [CUSTOM, MODULE_AGENT]) {
      const result = await execute(
        makeTool(),
        runCtx({ canSuspendForInteraction: false }),
        { suspend },
        agentId
      );
      expect(result?.code).toBe("agent_remove_needs_person");
    }
    expect(suspend).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(core.deleteSpaceMount).not.toHaveBeenCalled();
  });

  it("refuses the copilot, other interfaces and coordinators", async () => {
    const suspend = vi.fn(async () => undefined);
    const copilot = await execute(
      makeTool(),
      runCtx(),
      { suspend },
      "engenty.copilot"
    );
    expect(copilot?.code).toBe("agent_remove_interface");

    const delegated = await execute(
      makeTool(),
      runCtx(),
      { suspend },
      "tasks.assist"
    );
    expect(delegated?.code).toBe("agent_remove_not_removable");

    const coordinator = await execute(
      makeTool(),
      runCtx({ agentTypeKey: "engenty.copilot" }),
      { suspend },
      "office.lead"
    );
    expect(coordinator?.code).toBe("agent_remove_coordinator");

    expect(suspend).not.toHaveBeenCalled();
    expect(deleteAgent).not.toHaveBeenCalled();
    expect(core.deleteSpaceMount).not.toHaveBeenCalled();
  });

  it("refuses to remove itself, and refuses a specialist caller", async () => {
    const suspend = vi.fn(async () => undefined);
    const self = await execute(
      makeTool(),
      runCtx({
        agentTypeKey: CUSTOM,
        space: space({ topLevelAgentIds: new Set([CUSTOM]) }),
      }),
      { suspend }
    );
    expect(self?.code).toBe("agent_remove_self");

    const specialist = await execute(
      makeTool(),
      runCtx({ agentTypeKey: "office.helper" }),
      { suspend }
    );
    expect(specialist?.code).toBe("agent_remove_forbidden");

    expect(suspend).not.toHaveBeenCalled();
  });

  it("refuses an agent that is not mounted in this Space", async () => {
    const result = await execute(
      makeTool(),
      runCtx({ space: space({ agentIds: new Set(["office.lead"]) }) }),
      { suspend: vi.fn() },
      MODULE_AGENT
    );
    expect(result?.code).toBe("agent_remove_not_mounted");
  });
});
