import { beforeEach, describe, expect, it, vi } from "vitest";
import { canAccessThread, isSharedMastraRoom } from "../thread-access.js";

const invoke = vi.fn(async (..._args: unknown[]) => ({}) as unknown);

vi.mock("../task-workspace-hook.js", () => ({
  createScopeModuleOperationInvoker: () => invoke,
}));

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const scope = { tenantId: "t", userId: "u-1" } as never;

const owned = {
  agent_id: "engenty.copilot",
  created_by_user_id: "u-1",
  route_context: {},
  space_id: null,
};

const colleagueCopilot = {
  ...owned,
  created_by_user_id: "u-2",
};

const sharedSpecialist = {
  agent_id: "engenty.coordinator",
  created_by_user_id: "u-2",
  route_context: {},
  space_id: SPACE_ID,
};

const taskThread = {
  agent_id: "engenty.coordinator",
  created_by_user_id: null,
  route_context: { task_id: TASK_ID },
  space_id: SPACE_ID,
};

// A hired specialist is a DATABASE agent, and `ai.engenty_ai_agents` has no
// `agent_scope` column — so its config really does come back without
// `agentScope`. The fixtures keep that shape on purpose: the routine rule has
// to hold without it, or the desk lists a fire it cannot open.
const routineRunThread = {
  agent_id: "contacts.daily-summary",
  created_by_user_id: null,
  route_context: { routine_id: "01a039f8-ed1e-7565-b376-05854a688063" },
  space_id: SPACE_ID,
};

beforeEach(() => {
  invoke.mockClear();
  invoke.mockResolvedValue({ id: TASK_ID });
});

describe("isSharedMastraRoom", () => {
  it("is the task-bound thread", () => {
    expect(
      isSharedMastraRoom({ agentScope: "shared", session: taskThread })
    ).toBe(true);
  });

  it("is a shared specialist in a space", () => {
    expect(
      isSharedMastraRoom({
        agentScope: "shared",
        session: sharedSpecialist,
      })
    ).toBe(true);
  });

  it("is not Copilot, even in a space", () => {
    expect(
      isSharedMastraRoom({
        agentScope: "personal",
        session: { ...owned, space_id: SPACE_ID },
      })
    ).toBe(false);
  });

  it("is not a shared agent without a space", () => {
    expect(
      isSharedMastraRoom({
        agentScope: "shared",
        session: { ...sharedSpecialist, space_id: null },
      })
    ).toBe(false);
  });
});

describe("canAccessThread", () => {
  it("lets the owner read and write", async () => {
    await expect(
      canAccessThread({ action: "read", scope, session: owned })
    ).resolves.toBe(true);
    await expect(
      canAccessThread({ action: "write", scope, session: owned })
    ).resolves.toBe(true);
  });

  it("keeps a colleague's Copilot thread private", async () => {
    await expect(
      canAccessThread({ action: "read", scope, session: colleagueCopilot })
    ).resolves.toBe(false);
  });

  it("lets a space member into a shared specialist thread", async () => {
    const getAgentConfig = vi.fn(async () => ({
      agentScope: "shared" as const,
    }));
    const canEnterSpace = vi.fn(async () => true);
    await expect(
      canAccessThread({
        action: "write",
        canEnterSpace,
        getAgentConfig,
        scope,
        session: sharedSpecialist,
      })
    ).resolves.toBe(true);
    expect(canEnterSpace).toHaveBeenCalledWith(SPACE_ID);
  });

  it("a private room opens to its people only, not the space", async () => {
    const privateRoom = { ...sharedSpecialist, visibility: "private" };
    const shared = async () => ({ agentScope: "shared" as const });
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => true,
        getAgentConfig: shared,
        isParticipant: async () => false,
        scope,
        session: privateRoom,
      })
    ).resolves.toBe(false);
    await expect(
      canAccessThread({
        action: "write",
        canEnterSpace: async () => true,
        getAgentConfig: shared,
        isParticipant: async () => true,
        scope,
        session: privateRoom,
      })
    ).resolves.toBe(true);
    // Nobody asked who is in it: closed.
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => true,
        getAgentConfig: shared,
        scope,
        session: privateRoom,
      })
    ).resolves.toBe(false);
  });

  it("refuses a shared specialist when the caller cannot enter the space", async () => {
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => false,
        getAgentConfig: async () => ({ agentScope: "shared" }),
        scope,
        session: sharedSpecialist,
      })
    ).resolves.toBe(false);
  });

  it("does not treat a personal agent in a space as a shared room", async () => {
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => true,
        getAgentConfig: async () => ({ agentScope: "personal" }),
        scope,
        session: { ...colleagueCopilot, space_id: SPACE_ID },
      })
    ).resolves.toBe(false);
  });

  it("lets a task reader write the task-bound thread", async () => {
    await expect(
      canAccessThread({
        action: "write",
        scope: { tenantId: "t", userId: "u-watcher" } as never,
        session: taskThread,
      })
    ).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("tasks_get", { id: TASK_ID });
  });

  it("refuses a task thread when the caller cannot read the task", async () => {
    invoke.mockRejectedValue(new Error("Forbidden"));
    await expect(
      canAccessThread({
        action: "write",
        scope,
        session: taskThread,
      })
    ).resolves.toBe(false);
  });

  it("refuses a task thread whose task is gone", async () => {
    invoke.mockResolvedValue(null);
    await expect(
      canAccessThread({ action: "read", scope, session: taskThread })
    ).resolves.toBe(false);
  });

  it("keeps a colleague's chat private even when it names a task", async () => {
    await expect(
      canAccessThread({
        action: "read",
        scope,
        session: { ...colleagueCopilot, route_context: { task_id: TASK_ID } },
      })
    ).resolves.toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("lets a Space member read a routine run without an agentScope", async () => {
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => true,
        getAgentConfig: async () => ({}),
        scope,
        session: routineRunThread,
      })
    ).resolves.toBe(true);
  });

  it("refuses a routine run to someone who cannot enter the Space", async () => {
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => false,
        getAgentConfig: async () => ({}),
        scope,
        session: routineRunThread,
      })
    ).resolves.toBe(false);
  });

  it("refuses a routine run that carries no Space", async () => {
    await expect(
      canAccessThread({
        action: "read",
        canEnterSpace: async () => true,
        getAgentConfig: async () => ({}),
        scope,
        session: { ...routineRunThread, space_id: null },
      })
    ).resolves.toBe(false);
  });

  it("lets a superadmin read another user's Copilot thread", async () => {
    await expect(
      canAccessThread({
        action: "read",
        scope: { tenantId: "t", userId: "u-1", isSuperAdmin: true } as never,
        session: colleagueCopilot,
      })
    ).resolves.toBe(true);
  });

  it("does not let a superadmin write another user's Copilot thread", async () => {
    await expect(
      canAccessThread({
        action: "write",
        scope: { tenantId: "t", userId: "u-1", isSuperAdmin: true } as never,
        session: colleagueCopilot,
      })
    ).resolves.toBe(false);
  });
});
