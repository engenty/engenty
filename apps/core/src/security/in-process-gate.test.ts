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
import { linkPrincipal } from "./principal-link.js";

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
    // An anonymous-visitor context (projects portal) has no human to answer an
    // approval; the capability list it states is the ceiling.
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

  it("audits deny with the in-process component (skips routine allow)", async () => {
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
    expect(pushed.map((e) => e.type)).toEqual(["policy.deny"]);
    expect(pushed.every((e) => e.source_component === "in-process")).toBe(true);
  });
});
