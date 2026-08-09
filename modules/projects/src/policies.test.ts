import type { PluginPolicyInput } from "@engenty/plugin-sdk";
import { describe, expect, it } from "vitest";
import { createProjectVisibilityPolicy } from "./policies.js";

// Fake Supabase-ish client: projects[id] -> visibility, teams[projectId] -> userIds.
function fakeDb(
  projects: Record<string, string>,
  teams: Record<string, string[]>
) {
  return {
    schema: () => ({
      from: (table: string) => ({
        select: () => {
          const filters: Record<string, string> = {};
          const builder = {
            eq(column: string, value: string) {
              filters[column] = value;
              return builder;
            },
            maybeSingle() {
              if (table === "projects") {
                const visibility = projects[filters.id];
                return Promise.resolve({
                  data: visibility ? { visibility } : null,
                  error: null,
                });
              }
              const members = teams[filters.project_id] ?? [];
              return Promise.resolve({
                data: members.includes(filters.user_id)
                  ? { user_id: filters.user_id }
                  : null,
                error: null,
              });
            },
          };
          return builder;
        },
      }),
    }),
  };
}

function input(
  overrides: Partial<PluginPolicyInput> & {
    principalId?: string;
    capabilities?: string[];
    inputObj?: unknown;
  }
): PluginPolicyInput {
  return {
    moduleId: "projects",
    operationId: "projects_get",
    requiredCapabilities: [],
    requiresApproval: false,
    riskLevel: "low",
    input: overrides.inputObj ?? { id: "p1" },
    auth: {
      audience: [],
      authMethod: "oauth",
      capabilities: overrides.capabilities ?? ["module.projects.read"],
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

describe("createProjectVisibilityPolicy", () => {
  it("abstains for tenant-visible projects", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "tenant" }, {})) as never);
    expect(await policy(input({}))).toBeNull();
  });

  it("denies a non-member on a members-only project", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "members" }, { p1: ["u2"] })) as never);
    const decision = await policy(input({ principalId: "u1" }));
    expect(decision?.action).toBe("deny");
  });

  it("allows a team member on a members-only project", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "members" }, { p1: ["u1"] })) as never);
    expect(await policy(input({ principalId: "u1" }))).toBeNull();
  });

  it("lets tenant admins and moderators bypass", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "members" }, {})) as never);
    expect(await policy(input({ capabilities: ["*"] }))).toBeNull();
    expect(
      await policy(input({ capabilities: ["module.projects.moderate"] }))
    ).toBeNull();
  });

  it("abstains for operations with no project id (e.g. list)", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "members" }, {})) as never);
    expect(
      await policy(input({ operationId: "projects_list", inputObj: {} }))
    ).toBeNull();
  });

  it("abstains for other modules", async () => {
    const policy = createProjectVisibilityPolicy((() =>
      fakeDb({ p1: "members" }, {})) as never);
    const other = { ...input({}), moduleId: "contacts" } as PluginPolicyInput;
    expect(await policy(other)).toBeNull();
  });
});
