import { describe, expect, it } from "vitest";
import type { PrincipalContext } from "./auth.js";
import { evaluatePolicy, type PolicyInput } from "./policy.js";

function principal(
  overrides: Partial<PrincipalContext> = {}
): PrincipalContext {
  return {
    audience: ["engenty"],
    authMethod: "oauth",
    capabilities: ["*"],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: "p-1",
    principalType: "user",
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: "t-1",
    tokenType: "access",
    ...overrides,
  };
}

function highRiskWrite(auth: PrincipalContext): PolicyInput {
  return {
    auth,
    moduleId: "tasks",
    operationId: "triggers_create",
    requiredCapabilities: ["module.tasks.write"],
    requiresApproval: true,
    riskLevel: "high",
  };
}

describe("evaluatePolicy", () => {
  it("allows a user principal on a high-risk op without approval", async () => {
    const decision = await evaluatePolicy(highRiskWrite(principal()));
    expect(decision.action).toBe("allow");
  });

  it("escalates an agent principal on a high-risk op", async () => {
    const decision = await evaluatePolicy(
      highRiskWrite(principal({ principalType: "agent" }))
    );
    expect(decision.action).toBe("require_approval");
  });

  it("allows the platform service credential acting on its own behalf", async () => {
    // The scheduler's reconcile/fire lane: unattended by definition, so an
    // approval escalation would deadlock it. This is the exact call shape that
    // left prod with zero triggers ("Approval required" on triggers_create).
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          authMethod: "service_credential",
          principalType: "service",
        })
      )
    );
    expect(decision.action).toBe("allow");
  });

  it("still escalates an agent riding the service token", async () => {
    // Headless task runs forward x-engenty-agent-id — the durable-approvals
    // lane must keep gating them even though the bearer is the service token.
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          agentId: "agent-1",
          authMethod: "service_credential",
          principalType: "service",
        })
      )
    );
    expect(decision.action).toBe("require_approval");
  });

  it("still escalates a service principal that is not the platform credential", async () => {
    // e.g. an arbitrary token whose role claim fell back to "service" but was
    // not minted from core.service_credential.
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({ authMethod: "api_token", principalType: "service" })
      )
    );
    expect(decision.action).toBe("require_approval");
  });

  it("denies before considering the exemption when a capability is missing", async () => {
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          authMethod: "service_credential",
          capabilities: ["module.read"],
          principalType: "service",
        })
      )
    );
    expect(decision.action).toBe("deny");
    expect(decision.reason).toContain("module.tasks.write");
  });

  it("lets a profile policy override the platform-service exemption", async () => {
    // Profile policies (e.g. connections per-connection state) run first and
    // must keep the last word — the exemption only relaxes the generic gate.
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          authMethod: "service_credential",
          principalType: "service",
        })
      ),
      {
        profilePolicies: [
          {
            pluginConfig: {},
            pluginId: "tasks",
            policy: () => ({
              action: "require_approval" as const,
              reason: "profile says ask",
            }),
            source: "test",
          },
        ],
      }
    );
    expect(decision.action).toBe("require_approval");
  });
});
