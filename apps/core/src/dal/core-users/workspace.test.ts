import { capabilityCovers } from "@engenty/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capabilitiesForUser } from "../../security/user-capabilities.js";
import type { SupabaseAuthVerificationConfig } from "./auth.js";
import {
  getServiceWorkspaceContext,
  getWorkspaceContext,
} from "./workspace.js";

const testAuthConfig: SupabaseAuthVerificationConfig = {
  anonKey: "test-anon-key",
  url: "https://test.supabase.co",
};

const authApiUser = {
  id: "user-1",
  email: "user@example.com",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

vi.mock("../resolved-appearance.js", () => ({
  getResolvedAppearance: vi.fn().mockResolvedValue({
    font: "engenty",
    fontSize: "100",
    language: "en",
    themeMode: "system",
  }),
  getResolvedAppearanceWithoutTenant: vi.fn().mockResolvedValue({
    font: "engenty",
    fontSize: "100",
    language: "en",
    themeMode: "system",
  }),
}));

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: async (token: string) => {
        if (token === "valid-token") {
          return {
            error: null,
            data: {
              user: {
                id: "user-1",
                email: "user@example.com",
                app_metadata: {},
                user_metadata: {},
                aud: "authenticated",
                created_at: new Date().toISOString(),
              },
            },
          };
        }
        return {
          error: new Error("Unauthorized"),
          data: { user: null },
        };
      },
    },
    schema: () => ({
      from: (table: string) => {
        if (table === "users") {
          return {
            select: (cols: string) => ({
              eq: (_col: string, _val: unknown) => ({
                eq: (_c2?: string, _v2?: unknown) => ({
                  maybeSingle: async () =>
                    cols === "tenant_id"
                      ? { error: null, data: { tenant_id: "tenant-1" } }
                      : {
                          error: null,
                          data: {
                            id: "user-1",
                            tenant_id: "tenant-1",
                            role: "member",
                            is_super_admin: false,
                            email: "user@example.com",
                            display_name: null,
                            created_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                          },
                        },
                }),
                maybeSingle: async () =>
                  cols === "tenant_id"
                    ? { error: null, data: { tenant_id: "tenant-1" } }
                    : { error: null, data: null },
              }),
            }),
          };
        }
        if (table === "tenants") {
          return {
            select: (cols?: string) => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (cols === "package_id") {
                    return {
                      error: null,
                      data: { package_id: null },
                    };
                  }
                  return {
                    error: null,
                    data: { id: "tenant-1", slug: "acme", name: "Acme Inc" },
                  };
                },
              }),
              in: () => ({
                order: async () => ({
                  error: null,
                  data: [{ id: "tenant-1", slug: "acme", name: "Acme Inc" }],
                }),
              }),
              order: async () => ({
                error: null,
                data: [
                  { id: "tenant-1", slug: "acme", name: "Acme Inc" },
                  { id: "tenant-2", slug: "beta", name: "Beta" },
                ],
              }),
            }),
          };
        }
        if (table === "packages") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ error: null, data: null }),
              }),
            }),
          };
        }
        if (table === "user_tenant_roles") {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  error: null,
                  data: [{ tenant_id: "tenant-1" }],
                }),
            }),
          };
        }
        return {};
      },
    }),
    ...overrides,
  };
}

describe("workspace context capabilities", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => authApiUser,
        text: async () => "",
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gives a member the tenant.member bundle — module tier, no core.*", async () => {
    const ctx = await getWorkspaceContext(
      makeClient() as never,
      "valid-token",
      testAuthConfig
    );
    expect(ctx.tenantRole).toBe("member");
    expect(ctx.capabilities).toEqual(
      capabilitiesForUser({ isSuperAdmin: false, tenantRole: "member" })
    );
    // apps/ai gates `core.ai.*` on this bundle, so a member must cover no core.* id.
    expect(capabilityCovers(ctx.capabilities, "core.ai.dispatch")).toBe(false);
  });

  it("gives an unonboarded user no capabilities at all", async () => {
    const client = makeClient({
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ error: null, data: null }),
            }),
          }),
        }),
      }),
    });
    const ctx = await getWorkspaceContext(
      client as never,
      "valid-token",
      testAuthConfig
    );
    expect(ctx.onboarded).toBe(false);
    expect(ctx.capabilities).toEqual([]);
  });

  it("passes a service principal's own claims through unwidened", async () => {
    const ctx = await getServiceWorkspaceContext(makeClient() as never, {
      capabilities: ["module.read", "module.write", "module.execute"],
      principalId: "cred-1",
      tenantId: "tenant-1",
    });
    expect(ctx.tenantRole).toBe("service");
    expect(ctx.isTenantAdmin).toBe(false);
    expect(ctx.capabilities).toEqual([
      "module.read",
      "module.write",
      "module.execute",
    ]);
    expect(capabilityCovers(ctx.capabilities, "core.ai.dispatch")).toBe(false);
  });
});
