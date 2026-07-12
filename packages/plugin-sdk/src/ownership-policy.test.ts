import { describe, expect, it } from "vitest";
import { capabilityCovers } from "./capability-match.js";
import type { PluginPolicyInput } from "./index.js";
import { ownershipPolicy } from "./ownership-policy.js";

describe("capabilityCovers", () => {
  it("global + prefix wildcards and exact match", () => {
    expect(capabilityCovers(["*"], "module.x.write")).toBe(true);
    expect(capabilityCovers(["core.*"], "anything")).toBe(true);
    expect(capabilityCovers(["core.superadmin"], "anything")).toBe(true);
    expect(capabilityCovers(["module.x.write"], "module.x.write")).toBe(true);
    expect(capabilityCovers(["module.*"], "module.x.write")).toBe(true);
  });
  it("denies unrelated grants", () => {
    expect(capabilityCovers(["module.y.read"], "module.x.write")).toBe(false);
    expect(capabilityCovers([], "module.x.write")).toBe(false);
  });
});

function input(
  overrides: {
    operationId?: string;
    moduleId?: string;
    capabilities?: string[];
    principalId?: string;
    inputObj?: unknown;
  } = {}
): PluginPolicyInput {
  return {
    moduleId: overrides.moduleId ?? "projects",
    operationId: overrides.operationId ?? "projects.comments.delete",
    requiredCapabilities: [],
    requiresApproval: false,
    riskLevel: "low",
    input: overrides.inputObj ?? { commentId: "c1" },
    auth: {
      audience: [],
      authMethod: "oauth",
      capabilities: overrides.capabilities ?? ["module.projects.write"],
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: overrides.principalId ?? "u1",
      principalType: "user",
      roleProfiles: [],
      roles: [],
      scopes: [],
      tenantId: "t1",
      tokenType: "access",
    },
  } as PluginPolicyInput;
}

describe("ownershipPolicy", () => {
  const make = (owner: string | null) =>
    ownershipPolicy({
      moduleId: "projects",
      operationIds: ["projects.comments.update", "projects.comments.delete"],
      overrideCapability: "module.projects.moderate",
      loadOwnerId: () => Promise.resolve(owner),
    });

  it("allows the owner", async () => {
    expect(await make("u1")(input({ principalId: "u1" }))).toBeNull();
  });
  it("denies a non-owner", async () => {
    const d = await make("u2")(input({ principalId: "u1" }));
    expect(d?.action).toBe("deny");
  });
  it("lets moderators bypass", async () => {
    expect(
      await make("u2")(
        input({ principalId: "u1", capabilities: ["module.projects.moderate"] })
      )
    ).toBeNull();
  });
  it("abstains for other operations and modules", async () => {
    expect(
      await make("u2")(input({ operationId: "projects.comments.create" }))
    ).toBeNull();
    expect(await make("u2")(input({ moduleId: "contacts" }))).toBeNull();
  });
  it("denies when owner is unresolved (fail-closed)", async () => {
    const d = await make(null)(input({ principalId: "u1" }));
    expect(d?.action).toBe("deny");
  });
});
