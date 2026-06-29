import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseAuthVerificationConfig } from "./auth.js";
import { getWorkspaceContext } from "./workspace.js";

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

const expectedResolvedAppearance = {
  font: "engenty",
  fontSize: "100",
  language: "en",
  themeMode: "system",
};

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
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  error: null,
                  data: { id: "tenant-1", slug: "acme", name: "Acme Inc" },
                }),
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

describe("getWorkspaceContext", () => {
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

  it("returns onboarded false when user has no tenant", async () => {
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
    expect(ctx.userId).toBe("user-1");
    expect(ctx.currentUser).toEqual({
      id: "user-1",
      email: "user@example.com",
      display_name: null,
      initials: null,
      role: null,
    });
    expect(ctx.isSuperAdmin).toBe(false);
    expect(ctx.isTenantAdmin).toBe(false);
    expect(ctx.currentTenant).toBeNull();
    expect(ctx.tenantRole).toBeNull();
    expect(ctx.tenants).toEqual([]);
    expect(ctx.canSwitchTenant).toBe(false);
    expect(ctx.resolvedAppearance).toEqual(expectedResolvedAppearance);
    expect(ctx.tenantSupportedLocales).toEqual([]);
  });

  it("returns onboarded true with current tenant when user has tenant", async () => {
    const client = makeClient();
    const ctx = await getWorkspaceContext(
      client as never,
      "valid-token",
      testAuthConfig
    );
    expect(ctx.onboarded).toBe(true);
    expect(ctx.userId).toBe("user-1");
    expect(ctx.currentUser).toMatchObject({
      id: "user-1",
      email: "user@example.com",
      role: "member",
    });
    expect(ctx.currentTenant).toEqual({
      id: "tenant-1",
      slug: "acme",
      name: "Acme Inc",
    });
    expect(ctx.isTenantAdmin).toBe(false);
    expect(ctx.tenantRole).toBe("member");
    expect(ctx.tenants).toHaveLength(1);
    expect(ctx.canSwitchTenant).toBe(false);
    expect(ctx.resolvedAppearance).toEqual(expectedResolvedAppearance);
    expect(ctx.tenantSupportedLocales).toEqual(["en", "de"]);
  });

  it("returns canSwitchTenant true when superadmin with multiple tenants", async () => {
    const superAdminRow = {
      id: "user-1",
      tenant_id: "tenant-1",
      role: "admin",
      is_super_admin: true,
      email: "user@example.com",
      display_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const client = makeClient({
      schema: () => ({
        from: (table: string) => {
          if (table === "users") {
            return {
              select: (cols: string) => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      error: null,
                      data: superAdminRow,
                    }),
                  }),
                  maybeSingle: async () =>
                    cols === "tenant_id"
                      ? { error: null, data: { tenant_id: "tenant-1" } }
                      : { error: null, data: superAdminRow },
                }),
              }),
            };
          }
          if (table === "tenants") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    error: null,
                    data: { id: "tenant-1", slug: "acme", name: "Acme" },
                  }),
                }),
                order: async () => ({
                  error: null,
                  data: [
                    { id: "tenant-1", slug: "acme", name: "Acme" },
                    { id: "tenant-2", slug: "beta", name: "Beta" },
                  ],
                }),
              }),
            };
          }
          return {};
        },
      }),
    });
    const ctx = await getWorkspaceContext(
      client as never,
      "valid-token",
      testAuthConfig
    );
    expect(ctx.onboarded).toBe(true);
    expect(ctx.isSuperAdmin).toBe(true);
    expect(ctx.isTenantAdmin).toBe(true);
    expect(ctx.tenantRole).toBe("admin");
    expect(ctx.tenants).toHaveLength(2);
    expect(ctx.canSwitchTenant).toBe(true);
    expect(ctx.resolvedAppearance).toEqual(expectedResolvedAppearance);
    expect(ctx.tenantSupportedLocales).toEqual(["en", "de"]);
  });
});
