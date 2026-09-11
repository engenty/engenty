import type { PluginPolicyInput } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import { createAgentEscalationPolicy } from "./agent-escalation-policy.js";

function input(overrides: {
  agentId?: string;
  goalId?: string;
  spaceId?: string;
  actingForUserId?: string;
  requiredCapabilities?: string[];
}): PluginPolicyInput {
  return {
    moduleId: "invoices",
    operationId: "invoices_send",
    requiredCapabilities: overrides.requiredCapabilities ?? [
      "module.invoices.write",
    ],
    requiresApproval: false,
    riskLevel: "high",
    auth: {
      agentId: overrides.agentId,
      goalId: overrides.goalId,
      spaceId: overrides.spaceId,
      actingForUserId: overrides.actingForUserId,
      audience: [],
      authMethod: "oauth",
      capabilities: [],
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: overrides.agentId ?? "u1",
      principalType: "user",
      roleProfiles: [],
      roles: [],
      scopes: [],
      tenantId: "t1",
      tokenType: "access",
    },
  } as PluginPolicyInput;
}

describe("createAgentEscalationPolicy", () => {
  it("abstains when no agent drives the request", async () => {
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: vi.fn(),
      listGoalGrantCapabilities: vi.fn(),
    });
    expect(await policy(input({}))).toBeNull();
  });

  it("allows when the agent's role grants cover the operation", async () => {
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () =>
        Promise.resolve(["module.invoices.read", "module.invoices.write"]),
      listGoalGrantCapabilities: () => Promise.resolve([]),
    });
    expect(await policy(input({ agentId: "a1" }))).toBeNull();
  });

  it("escalates to approval when outside the agent's grants", async () => {
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () => Promise.resolve(["module.invoices.read"]),
      listGoalGrantCapabilities: () => Promise.resolve([]),
    });
    const decision = await policy(input({ agentId: "a1", goalId: "g1" }));
    expect(decision?.action).toBe("require_approval");
  });

  it("allows when a goal grant covers the gap (no re-prompt)", async () => {
    const listGoalGrantCapabilities = vi.fn(() =>
      Promise.resolve(["module.invoices.write"])
    );
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () => Promise.resolve(["module.invoices.read"]),
      listGoalGrantCapabilities,
    });
    expect(await policy(input({ agentId: "a1", goalId: "g1" }))).toBeNull();
    expect(listGoalGrantCapabilities).toHaveBeenCalledWith("t1", "g1", "a1");
  });

  it("mentions acting-for-you when a user is present (chat)", async () => {
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () => Promise.resolve([]),
      listGoalGrantCapabilities: () => Promise.resolve([]),
    });
    const decision = await policy(
      input({ agentId: "a1", goalId: "g1", actingForUserId: "u9" })
    );
    expect(decision?.reason).toMatch(/for you/);
  });

  it("does not read goal grants when no goal id is set (autonomous, no goal)", async () => {
    const listGoalGrantCapabilities = vi.fn();
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () => Promise.resolve(["module.invoices.read"]),
      listGoalGrantCapabilities,
    });
    const decision = await policy(input({ agentId: "a1" }));
    expect(decision?.action).toBe("require_approval");
    expect(listGoalGrantCapabilities).not.toHaveBeenCalled();
  });

  it("allows when a space mount covers the gap", async () => {
    const resolveSpaceCapabilities = vi.fn(() =>
      Promise.resolve(["module.projects.read", "module.projects.write"])
    );
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () =>
        Promise.resolve(["module.tasks.read", "module.tasks.write"]),
      listGoalGrantCapabilities: () => Promise.resolve([]),
      resolveSpaceCapabilities,
    });
    expect(
      await policy(
        input({
          agentId: "a1",
          spaceId: "s1",
          requiredCapabilities: ["module.projects.write"],
        })
      )
    ).toBeNull();
    expect(resolveSpaceCapabilities).toHaveBeenCalledWith("t1", "s1");
  });

  it("does not read space caps when no space id is set", async () => {
    const resolveSpaceCapabilities = vi.fn();
    const policy = createAgentEscalationPolicy({
      resolveAgentCapabilities: () => Promise.resolve(["module.tasks.read"]),
      listGoalGrantCapabilities: () => Promise.resolve([]),
      resolveSpaceCapabilities,
    });
    const decision = await policy(
      input({
        agentId: "a1",
        requiredCapabilities: ["module.projects.write"],
      })
    );
    expect(decision?.action).toBe("require_approval");
    expect(resolveSpaceCapabilities).not.toHaveBeenCalled();
  });
});
