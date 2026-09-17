import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { describe, expect, it, vi } from "vitest";
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
    // The scheduler's reconcile/fire lane: unattended by definition, so an
    // approval escalation would deadlock it. This is the exact call shape that
    // left prod with zero routines ("Approval required" on routines_create).
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
    // DECISION 2026-08-03, AUTH-03 Option A (Matthias): this gate STAYS.
    //
    // A working-tree change had widened the exemption to cover any
    // service-credential principal, agent or not, on the grounds that "the
    // agent escalation profile policy above" governs those runs instead. That
    // policy was registered only behind ENGENTY_AGENT_ESCALATION, which was set
    // in no manifest and no compose file — so the replacement gate did not
    // exist in any deployment and the widening simply failed open.
    //
    // Option A: keep this gate, and make the escalation policy real too. The
    // flag has since been DELETED and that policy now registers
    // unconditionally, precisely so it can never again be absent by default.
    // The approve → re-dispatch → 202 → blocked deadlock that motivated the
    // widening is a symptom of approvals living in three unsynced stores; it
    // gets fixed by the approval-store unification plan, NOT by deleting
    // enforcement. Do not re-widen this without a recorded decision.
    //
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

  describe("composed with the agent escalation policy", () => {
    // Option A ships this policy registered. In isolation it is covered by
    // agent-escalation-policy.test.ts; what matters here is how the two gates
    // COMPOSE, because the AUTH-03 widening was justified by assuming this one
    // had already taken over.
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

    it("escalates a chat agent whose grants do not cover the op", async () => {
      // principalType "user" + agentId: the blanket gate never fires here, so
      // before the flag shipped NOTHING gated this call.
      const decision = await evaluatePolicy(
        highRiskWrite(principal({ agentId: "agent-1" })),
        withEscalation(["module.tasks.read"])
      );
      expect(decision.action).toBe("require_approval");
    });

    it("allows a chat agent whose grants cover the op", async () => {
      const decision = await evaluatePolicy(
        highRiskWrite(principal({ agentId: "agent-1" })),
        withEscalation(["module.tasks.write"])
      );
      expect(decision.action).toBe("allow");
    });

    it("keeps escalating a headless agent even when its grants cover the op", async () => {
      // The gate the widening removed. Grant coverage satisfies the escalation
      // policy, which then abstains — and the blanket rule below it still
      // requires a human. That layering IS the decision.
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

    it("leaves the unattended scheduler lane alone", async () => {
      // No agent id → the escalation policy abstains, the platform-service
      // exemption applies, and trigger reconcile/fire still runs.
      const decision = await evaluatePolicy(
        highRiskWrite(
          principal({
            authMethod: "service_credential",
            principalType: "service",
          })
        ),
        withEscalation([])
      );
      expect(decision.action).toBe("allow");
    });
  });

  it("pass-all skips the human on a capable high-risk op without adding caps", async () => {
    const decision = await evaluatePolicy(
      highRiskWrite(principal({ principalType: "agent" })),
      undefined,
      {
        resolveAgentApproval: async () => ({
          mode: "pass-all",
          spaceWriteMounted: false,
        }),
      }
    );
    expect(decision.action).toBe("allow");
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
    const resolveAgentApproval = vi.fn(async () => ({
      mode: "pass-all" as const,
      spaceWriteMounted: true,
    }));
    const decision = await evaluatePolicy(
      highRiskWrite(
        principal({
          maxRiskLevel: "medium",
          principalType: "agent",
        })
      ),
      undefined,
      { resolveAgentApproval }
    );
    expect(decision).toMatchObject({
      action: "deny",
      reason: "operation risk high exceeds grant ceiling medium",
    });
    expect(resolveAgentApproval).not.toHaveBeenCalled();
  });

  it("auto passes a medium space-mounted write and still asks for high", async () => {
    const mediumWrite: PolicyInput = {
      auth: principal({ principalType: "agent" }),
      moduleId: "tasks",
      operationId: "tasks_update",
      requiredCapabilities: ["module.tasks.write"],
      requiresApproval: true,
      riskLevel: "medium",
    };
    const autoMounted = await evaluatePolicy(mediumWrite, undefined, {
      resolveAgentApproval: async () => ({
        mode: "auto",
        spaceWriteMounted: true,
      }),
    });
    expect(autoMounted.action).toBe("allow");
    const autoHigh = await evaluatePolicy(
      highRiskWrite(principal({ principalType: "agent" })),
      undefined,
      {
        resolveAgentApproval: async () => ({
          mode: "auto",
          spaceWriteMounted: true,
        }),
      }
    );
    expect(autoHigh.action).toBe("require_approval");
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

  describe("grant consumption (D2 phase 3)", () => {
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

    it("keeps require_approval when no grant covers the call", async () => {
      const store = grantStore(false);
      const decision = await evaluatePolicy(
        highRiskWrite(principal({ principalType: "agent" })),
        undefined,
        store
      );
      expect(decision.action).toBe("require_approval");
    });

    it("never consults grants when the decision is allow or deny", async () => {
      const store = grantStore(true);
      await evaluatePolicy(highRiskWrite(principal()), undefined, store);
      await evaluatePolicy(
        highRiskWrite(principal({ capabilities: ["module.read"] })),
        undefined,
        store
      );
      expect(store.calls).toHaveLength(0);
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

    it("spends grants for profile-policy escalations too", async () => {
      const store = grantStore(true);
      const decision = await evaluatePolicy(
        highRiskWrite(principal()),
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
        },
        store
      );
      expect(decision.action).toBe("allow");
      expect(store.calls).toHaveLength(1);
    });
  });
});
