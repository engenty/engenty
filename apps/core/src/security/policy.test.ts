import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { describe, expect, it } from "vitest";
import { createAgentEscalationPolicy } from "./agent-escalation-policy.js";
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
    operationId: "routines_create",
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
    // The scheduler's reconcile/fire lane is unattended by definition, so an
    // approval escalation would deadlock it.
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
    // e.g. an API token that names role "service" but was not minted from
    // core.service_credential.
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

  describe("composed with the agent escalation policy", () => {
    function withEscalation(agentCapabilities: string[]) {
      return {
        profilePolicies: [
          {
            pluginConfig: {},
            pluginId: "core",
            policy: createAgentEscalationPolicy({
              listGoalGrantCapabilities: () => Promise.resolve([]),
              resolveAgentCapabilities: () =>
                Promise.resolve(agentCapabilities),
            }),
            source: "core" as const,
          },
        ],
      };
    }

    it("keeps escalating a headless agent even when its grants cover the op", async () => {
      // Grant coverage satisfies the escalation policy, but the blanket agent
      // gate below it must still require a human.
      const decision = await evaluatePolicy(
        highRiskWrite(
          principal({
            agentId: "agent-1",
            authMethod: "service_credential",
            principalType: "service",
          })
        ),
        withEscalation(["module.tasks.write"])
      );
      expect(decision.action).toBe("require_approval");
    });
  });

  it("asks for an agent's call that names its approver, even in pass-all", async () => {
    // Publishing to the company drive: a Space set to wave agents through
    // must not let one publish without someone who holds the right seeing it.
    const decision = await evaluatePolicy(
      {
        ...highRiskWrite(principal({ principalType: "agent" })),
        approverCapability: "core.company_files.manage",
      },
      undefined,
      {
        resolveAgentApproval: async () => ({
          mode: "pass-all",
          spaceWriteMounted: true,
        }),
      }
    );
    expect(decision.action).toBe("require_approval");
  });

  it("pass-all still denies when the token lacks the cap", async () => {
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          capabilities: ["module.read"],
          principalType: "agent",
        })
      ),
      undefined,
      {
        resolveAgentApproval: async () => ({
          mode: "pass-all",
          spaceWriteMounted: false,
        }),
      }
    );
    expect(decision.action).toBe("deny");
  });

  it("denies above a delegated risk ceiling before approval can widen it", async () => {
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          maxRiskLevel: "medium",
          principalType: "agent",
        })
      ),
      undefined,
      {
        resolveAgentApproval: async () => ({
          mode: "pass-all",
          spaceWriteMounted: true,
        }),
      }
    );
    expect(decision.action).toBe("deny");
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

  describe("grant consumption", () => {
    // The policy engine spends approval grants itself: a covering grant turns
    // require_approval into allow, so transports only ever see
    // require_approval when a human genuinely has to answer.
    function grantStore(granted: boolean) {
      const calls: Parameters<
        NonNullable<
          NonNullable<Parameters<typeof evaluatePolicy>[2]>["approvalService"]
        >["consumeGrant"]
      >[0][] = [];
      return {
        calls,
        approvalService: {
          consumeGrant: async (input: (typeof calls)[number]) => {
            calls.push(input);
            return granted;
          },
        },
      };
    }

    it("turns require_approval into allow when a grant covers the call", async () => {
      const store = grantStore(true);
      const decision = await evaluatePolicy(
        highRiskWrite(principal({ principalType: "agent" })),
        undefined,
        store
      );
      expect(decision).toEqual({ action: "allow", reason: "approval grant" });
    });

    it("never lets a grant open a call the rules deny", async () => {
      const decision = await evaluatePolicy(
        highRiskWrite(principal({ capabilities: ["module.read"] })),
        undefined,
        grantStore(true)
      );
      expect(decision.action).toBe("deny");
    });

    it("binds the consume to the run's task/trigger/goal subjects", async () => {
      const store = grantStore(true);
      await evaluatePolicy(
        highRiskWrite(
          principal({
            goalId: "goal-1",
            principalType: "agent",
            sessionId: "sess-1",
            taskId: "task-1",
            triggerId: "trig-1",
          })
        ),
        undefined,
        store
      );
      expect(store.calls[0]).toMatchObject({
        actorId: "p-1",
        moduleId: "tasks",
        operationId: "routines_create",
        sessionId: "sess-1",
        subjectIds: ["task-1", "trig-1", "goal-1"],
        tenantId: "t-1",
      });
    });

    it("burns a real once-grant so the next call escalates again", async () => {
      const db = createFakeApprovalDb();
      const approvalService = createApprovalService(db.client);
      const auth = principal({ principalType: "agent" });
      const req = await approvalService.request({
        actorId: auth.principalId,
        moduleId: "tasks",
        operationId: "routines_create",
        reason: "high risk",
        tenantId: auth.tenantId,
      });
      await approvalService.decide({
        decidedBy: "user-1",
        decision: "allow_once",
        requestId: req.id,
        tenantId: auth.tenantId,
      });

      const deps = { approvalService };
      const first = await evaluatePolicy(highRiskWrite(auth), undefined, deps);
      const second = await evaluatePolicy(highRiskWrite(auth), undefined, deps);
      expect(first.action).toBe("allow");
      expect(second.action).toBe("require_approval");
    });
  });
});
