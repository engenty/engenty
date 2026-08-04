import type { PluginAuthContext } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugins/registry.js";
import { createNoopAuditLog } from "./audit-adapter.js";
import type { PrincipalContext } from "./auth.js";
import {
  enforceInProcessPolicy,
  type InProcessCall,
  InProcessPolicyError,
} from "./in-process-gate.js";
import { isApprovedEdge, linkPrincipal } from "./principal-link.js";

function principal(over: Partial<PrincipalContext> = {}): PrincipalContext {
  return {
    audience: [],
    authMethod: "oauth",
    capabilities: ["module.read", "module.write"],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: "user-1",
    principalType: "user",
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: "tenant-1",
    tokenType: "access",
    ...over,
  };
}

function call(over: Partial<InProcessCall> = {}): InProcessCall {
  return {
    moduleId: "contacts",
    operationId: "contacts_add_contact_role",
    requiredCapabilities: ["module.contacts.write"],
    requiresApproval: false,
    riskLevel: "low",
    ...over,
  };
}

function auth(over: Partial<PluginAuthContext> = {}): PluginAuthContext {
  return {
    capabilities: ["module.contacts.write"],
    principalId: "user-1",
    scopeId: "default",
    tenantId: "tenant-1",
    ...over,
  };
}

const gatedCall = call({ requiresApproval: true, riskLevel: "high" });

describe("enforceInProcessPolicy", () => {
  it("denies a call with no auth context when the operation declares requirements", async () => {
    await expect(enforceInProcessPolicy(call())).rejects.toBeInstanceOf(
      InProcessPolicyError
    );
  });

  it("denies when the caller's capabilities do not cover the operation", async () => {
    await expect(
      enforceInProcessPolicy(
        call({ auth: auth({ capabilities: ["module.contacts.read"] }) })
      )
    ).rejects.toThrow(/missing capability: module.contacts.write/);
  });

  it("allows when the caller holds the declared capability", async () => {
    await expect(
      enforceInProcessPolicy(call({ auth: auth() }))
    ).resolves.toBeUndefined();
  });

  it("infers the capability for an operation that declares none", async () => {
    // Same inference evaluatePolicyRules applies at the HTTP edges: a name
    // that does not read as a read is treated as a write.
    await expect(
      enforceInProcessPolicy(
        call({
          auth: auth({ capabilities: ["module.read"] }),
          requiredCapabilities: [],
        })
      )
    ).rejects.toThrow(/missing capability: module.write/);
  });

  it("runs registered profile policies", async () => {
    const registry = {
      profilePolicies: [
        {
          pluginId: "contacts",
          policy: () => ({
            action: "deny" as const,
            reason: "profile says no",
          }),
          source: "test",
          pluginConfig: {},
        },
      ],
    } as unknown as Pick<PluginRegistry, "profilePolicies">;
    await expect(
      enforceInProcessPolicy(call({ auth: auth() }), registry)
    ).rejects.toThrow(/profile says no/);
  });

  it("denies a gated operation for an agent with no grant and no approved edge", async () => {
    await expect(
      enforceInProcessPolicy({
        ...gatedCall,
        auth: auth({ principalType: "agent" }),
      })
    ).rejects.toThrow(/requires human approval/);
  });

  it("lets a covering approval grant open the gate", async () => {
    const consumed: unknown[] = [];
    await expect(
      enforceInProcessPolicy(
        { ...gatedCall, auth: auth({ principalType: "agent" }) },
        undefined,
        {
          approvalService: {
            consumeGrant: async (input) => {
              consumed.push(input);
              return true;
            },
          },
        }
      )
    ).resolves.toBeUndefined();
    expect(consumed).toHaveLength(1);
  });

  it("honors an approved outer edge for a gated nested call", async () => {
    const ctxAuth = linkPrincipal(auth({ principalType: "agent" }), {
      principal: principal({
        principalType: "agent",
        capabilities: ["module.contacts.write"],
      }),
      approvedEdge: true,
    });
    await expect(
      enforceInProcessPolicy({ ...gatedCall, auth: ctxAuth })
    ).resolves.toBeUndefined();
  });

  it("does not let an approved outer edge widen the capability check", async () => {
    const ctxAuth = linkPrincipal(auth({ capabilities: [] }), {
      principal: principal({ principalType: "agent", capabilities: [] }),
      approvedEdge: true,
    });
    await expect(
      enforceInProcessPolicy({ ...gatedCall, auth: ctxAuth })
    ).rejects.toThrow(/missing capability/);
  });

  it("evaluates the linked principal, not the lossy projection", async () => {
    // moduleIds on the token restrict which modules the actor may reach — a
    // reconstructed principal cannot know them, so the link must be used.
    const ctxAuth = linkPrincipal(auth(), {
      principal: principal({ moduleIds: ["offers"] }),
      approvedEdge: false,
    });
    await expect(
      enforceInProcessPolicy(call({ auth: ctxAuth }))
    ).rejects.toThrow(/module not allowed for actor/);
  });

  it("treats an unlinked service principal as the unattended platform lane", async () => {
    // The projects portal builds its own context for an anonymous visitor:
    // no human can answer an approval, and the capability list it states is
    // the ceiling.
    await expect(
      enforceInProcessPolicy({
        ...gatedCall,
        auth: auth({ principalType: "service" }),
      })
    ).resolves.toBeUndefined();
  });

  it("keeps the escalation for an agent riding a service credential", async () => {
    await expect(
      enforceInProcessPolicy({
        ...gatedCall,
        auth: auth({ principalType: "service", agentId: "agent-1" }),
      })
    ).rejects.toThrow(/requires human approval/);
  });

  it("audits allow and deny with the in-process component", async () => {
    const pushed: Record<string, unknown>[] = [];
    const auditLog = {
      ...createNoopAuditLog(),
      push: (event: Record<string, unknown>) => pushed.push(event),
    };
    await enforceInProcessPolicy(call({ auth: auth() }), undefined, {
      auditLog: auditLog as never,
    });
    await expect(
      enforceInProcessPolicy(
        call({ auth: auth({ capabilities: [] }) }),
        undefined,
        {
          auditLog: auditLog as never,
        }
      )
    ).rejects.toBeInstanceOf(InProcessPolicyError);
    expect(pushed.map((e) => e.type)).toEqual(["policy.allow", "policy.deny"]);
    expect(pushed.every((e) => e.source_component === "in-process")).toBe(true);
  });
});

describe("isApprovedEdge", () => {
  it("marks a gated operation that policy allowed", () => {
    expect(
      isApprovedEdge({
        action: "allow",
        requiresApproval: true,
        riskLevel: "low",
      })
    ).toBe(true);
    expect(
      isApprovedEdge({
        action: "allow",
        requiresApproval: false,
        riskLevel: "critical",
      })
    ).toBe(true);
  });

  it("does not mark a plain capability-allow on a non-gated operation", () => {
    expect(
      isApprovedEdge({
        action: "allow",
        requiresApproval: false,
        riskLevel: "medium",
      })
    ).toBe(false);
  });

  it("never marks a decision that did not allow", () => {
    expect(
      isApprovedEdge({
        action: "require_approval",
        requiresApproval: true,
        riskLevel: "high",
      })
    ).toBe(false);
  });
});
