import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AuthVerificationError,
  getTenantIdForAuthUser,
  isAuthUserAdmin,
  isAuthUserSuperAdmin,
  resolveAuthUser,
  type SupabaseAuthVerificationConfig,
} from "./auth.js";

const authConfig: SupabaseAuthVerificationConfig = {
  anonKey: "anon-key",
  url: "https://example.supabase.co",
};

const mockUser = {
  id: "user-1",
  email: "user@example.com",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
};

function mockFetchJson(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: async () => body,
      ok,
      text: async () => JSON.stringify(body),
    })
  );
}

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: (col: string, val: unknown) => ({
                maybeSingle: async () => {
                  if (col === "id" && val === "user-1") {
                    return {
                      error: null,
                      data: { tenant_id: "tenant-1" },
                    };
                  }
                  return { error: null, data: null };
                },
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resolveAuthUser", () => {
  it("returns user when auth endpoint accepts token", async () => {
    mockFetchJson(mockUser);
    const client = makeClient();

    const user = await resolveAuthUser(
      client as never,
      "valid-token",
      authConfig
    );

    expect(user.id).toBe("user-1");
    expect(user.email).toBe("user@example.com");
    expect(fetch).toHaveBeenCalledWith(
      new URL("/auth/v1/user", authConfig.url),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: authConfig.anonKey,
          authorization: "Bearer valid-token",
        }),
        method: "GET",
      })
    );
  });

  it("throws AuthVerificationError when auth endpoint rejects token", async () => {
    mockFetchJson({ message: "Unauthorized" }, false);
    const client = makeClient();

    await expect(
      resolveAuthUser(client as never, "invalid-token", authConfig)
    ).rejects.toBeInstanceOf(AuthVerificationError);
  });

  it("maps Supabase session_not_found to AuthVerificationError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          code: 403,
          error_code: "session_not_found",
          msg: "Session from session_id claim in JWT does not exist",
        }),
        ok: false,
        text: async () =>
          JSON.stringify({
            code: 403,
            error_code: "session_not_found",
            msg: "Session from session_id claim in JWT does not exist",
          }),
      })
    );
    const client = makeClient();

    await expect(
      resolveAuthUser(client as never, "stale-token", authConfig)
    ).rejects.toMatchObject({
      name: "AuthVerificationError",
      message: "Session from session_id claim in JWT does not exist",
    });
  });
});

describe("getTenantIdForAuthUser", () => {
  it("returns tenant_id when user has tenant", async () => {
    mockFetchJson(mockUser);
    const client = makeClient();

    const tenantId = await getTenantIdForAuthUser(
      client as never,
      "valid-token",
      authConfig
    );

    expect(tenantId).toBe("tenant-1");
  });

  it("returns null when user has no tenant row", async () => {
    mockFetchJson(mockUser);
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

    const tenantId = await getTenantIdForAuthUser(
      client as never,
      "valid-token",
      authConfig
    );

    expect(tenantId).toBeNull();
  });
});

describe("isAuthUserAdmin", () => {
  it("returns true when user is admin", async () => {
    mockFetchJson(mockUser);
    const userRow = {
      id: "user-1",
      tenant_id: "tenant-1",
      role: "admin",
      is_super_admin: false,
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
                eq: (_col: string, _val: unknown) => ({
                  eq: (_col2?: string, _val2?: unknown) => ({
                    maybeSingle: async () =>
                      cols === "tenant_id"
                        ? { error: null, data: { tenant_id: "tenant-1" } }
                        : { error: null, data: userRow },
                  }),
                  maybeSingle: async () =>
                    cols === "tenant_id"
                      ? { error: null, data: { tenant_id: "tenant-1" } }
                      : { error: null, data: userRow },
                }),
              }),
            };
          }
          return {};
        },
      }),
    });

    const isAdmin = await isAuthUserAdmin(
      client as never,
      "valid-token",
      authConfig
    );

    expect(isAdmin).toBe(true);
  });
});

describe("isAuthUserSuperAdmin", () => {
  it("returns true when row is super admin", async () => {
    mockFetchJson(mockUser);
    const superAdminRow = {
      id: "user-1",
      tenant_id: "tenant-1",
      role: "admin",
      is_super_admin: true,
    };
    const client = makeClient({
      schema: () => ({
        from: (table: string) => {
          if (table === "users") {
            return {
              select: (cols: string) => ({
                eq: (_col: string, _val: unknown) => ({
                  eq: (_c2?: string, _v2?: unknown) => ({
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
          return {};
        },
      }),
    });

    const isSuper = await isAuthUserSuperAdmin(
      client as never,
      "valid-token",
      authConfig
    );

    expect(isSuper).toBe(true);
  });

  it("returns true when app_metadata.is_super_admin is true", async () => {
    mockFetchJson({
      ...mockUser,
      app_metadata: { is_super_admin: true },
      email: "admin@example.com",
    });
    const userRow = {
      id: "user-1",
      tenant_id: "tenant-1",
      role: "admin",
      is_super_admin: false,
    };
    const client = makeClient({
      schema: () => ({
        from: (table: string) => {
          if (table === "users") {
            return {
              select: (cols: string) => ({
                eq: (_col: string, _val: unknown) => ({
                  eq: () => ({
                    maybeSingle: async () => ({ error: null, data: userRow }),
                  }),
                  maybeSingle: async () =>
                    cols === "tenant_id"
                      ? { error: null, data: { tenant_id: "tenant-1" } }
                      : { error: null, data: userRow },
                }),
              }),
            };
          }
          return {};
        },
      }),
    });

    const isSuper = await isAuthUserSuperAdmin(
      client as never,
      "valid-token-app-metadata-super-admin",
      authConfig
    );

    expect(isSuper).toBe(true);
  });
});
