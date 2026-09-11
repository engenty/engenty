import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";
import { AuthVerificationError } from "../dal/core-users/auth.js";
import type { CoreUsersDal } from "../dal/core-users.js";
import { registerUserManagementRoutes } from "./routes/user-management-routes.js";

const tenantId = "tenant-1";

function makeDal(overrides: Partial<CoreUsersDal> = {}): CoreUsersDal {
  // Annotated so the spread of a Partial below overrides rather than widens:
  // without it every required member picks up `| undefined` from `overrides`.
  const base: CoreUsersDal = {
    getSetupStatus: async () => ({ initialSetupRequired: true, usersCount: 0 }),
    resolveAuthUser: async () =>
      ({
        id: "u-admin",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: new Date().toISOString(),
      }) as never,
    getTenantIdForAuthUser: async () => tenantId,
    ensureCurrentAuthUser: async () => ({
      created: false,
      user: {
        id: "u-admin",
        tenant_id: "tenant-1",
        email: "admin@example.com",
        display_name: "Admin",
        role: "admin",
        is_super_admin: false,
        phone: null,
        initials: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    getWorkspaceContext: async () => ({
      onboarded: true,
      userId: "u-admin",
      capabilities: ["core.credentials.manage", "*"],
      currentUser: {
        id: "u-admin",
        email: "admin@example.com",
        display_name: "Admin",
        initials: null,
        role: "admin",
        is_super_admin: false,
      },
      isSuperAdmin: false,
      isTenantAdmin: true,
      currentTenant: {
        id: "tenant-1",
        slug: "default",
        name: "Default Tenant",
      },
      tenants: [{ id: "tenant-1", slug: "default", name: "Default Tenant" }],
      canSwitchTenant: false,
      planLabel: "local",
      resolvedAppearance: {
        font: "engenty",
        fontSize: "100",
        language: "en",
        themeMode: "system",
      },
      tenantRole: "admin",
      tenantSupportedLocales: ["en", "de"],
    }),
    initializeAdminForAuthUser: async () => ({
      user: {
        id: "u-admin",
        tenant_id: "tenant-1",
        email: "admin@example.com",
        display_name: "Admin",
        role: "admin",
        is_super_admin: false,
        phone: null,
        initials: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    isAuthUserAdmin: async () => true,
    isAuthUserSuperAdmin: async () => false,
    listUserDirectory: async () => [],
    listUsers: async () => [],
    getUserById: async () => null,
    updateUser: async () => {
      throw new Error("not implemented");
    },
    createUser: async () => {
      throw new Error("not implemented");
    },
    deleteUser: async () => undefined,
    updateUserPassword: async () => undefined,
    // Not exercised here; present so the double stays a whole CoreUsersDal and
    // the next member added to the interface fails this file loudly.
    createInitialAdmin: async () => {
      throw new Error("not implemented");
    },
    getServiceWorkspaceContext: async () => {
      throw new Error("not implemented");
    },
  };
  return { ...base, ...overrides };
}

function createApp(dal: CoreUsersDal) {
  const app = new OpenAPIHono();
  registerUserManagementRoutes({
    app,
    config: { securityJwtSecret: "test-secret" },
    dalFactory: () => dal,
  });
  return app;
}

describe("user management routes", () => {
  it("returns setup status and initializes first admin", async () => {
    const initialize = vi.fn(async () => ({
      user: {
        id: "u-admin",
        tenant_id: "tenant-1",
        email: "admin@example.com",
        display_name: "Admin",
        role: "admin" as const,
        is_super_admin: false,
        phone: null,
        initials: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
    const app = createApp(
      makeDal({
        initializeAdminForAuthUser: initialize,
      })
    );

    const status = await app.request("/api/users/setup/status");
    expect(status.status).toBe(200);
    const statusBody = (await status.json()) as {
      data: { initialSetupRequired: boolean };
    };
    expect(statusBody.data.initialSetupRequired).toBe(true);

    const init = await app.request("/api/users/setup/initialize-admin", {
      method: "POST",
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(init.status).toBe(200);
    expect(initialize).toHaveBeenCalledWith("supabase-token");
  });

  it("returns 401 when ensure-current-user receives a stale Supabase session", async () => {
    const app = createApp(
      makeDal({
        ensureCurrentAuthUser: async () => {
          throw new AuthVerificationError(
            "Session from session_id claim in JWT does not exist"
          );
        },
      })
    );
    const res = await app.request("/api/users/setup/ensure-current-user", {
      method: "POST",
      headers: { authorization: "Bearer stale-token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("session_id claim");
  });

  it("returns 503 with DB_UNAVAILABLE code when setup status cannot reach database", async () => {
    const app = createApp(
      makeDal({
        getSetupStatus: async () => {
          throw new TypeError("fetch failed");
        },
      })
    );
    const res = await app.request("/api/users/setup/status");
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("50001");
  });

  it("returns 503 when setup status hits a stale PostgREST schema cache", async () => {
    const app = createApp(
      makeDal({
        getSetupStatus: async () => {
          throw Object.assign(
            new Error(
              "Could not query the database for the schema cache. Retrying."
            ),
            { code: "PGRST002" }
          );
        },
      })
    );
    const res = await app.request("/api/users/setup/status");
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: false;
      error: { code: string; details?: Record<string, string> };
    };
    expect(body.error.code).toBe("50001");
    expect(body.error.details?.postgrest_or_db_code).toBe("PGRST002");
    expect(body.error.details?.error_message).toContain("schema cache");
  });

  it("exposes GET /api/system/database-health alongside user routes", async () => {
    const app = createApp(makeDal());
    const res = await app.request("/api/system/database-health");
    expect(res.status).toBe(200);
  });

  it("returns 403 when user has no tenant (not yet onboarded)", async () => {
    const app = createApp(
      makeDal({ getTenantIdForAuthUser: async () => null })
    );
    const response = await app.request("/api/users", {
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toContain("onboarded");
  });

  it("returns workspace context for authenticated user", async () => {
    const app = createApp(makeDal());
    const response = await app.request("/api/users/setup/context", {
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        onboarded: boolean;
        userId: string;
        currentUser: { email: string | null; display_name: string | null };
      };
    };
    expect(body.data.onboarded).toBe(true);
    expect(body.data.userId).toBe("u-admin");
    expect(body.data.currentUser).toMatchObject({
      email: "admin@example.com",
      display_name: "Admin",
    });
  });

  it("lists users for authenticated session token", async () => {
    const app = createApp(
      makeDal({
        listUsers: async () => [
          {
            id: "u1",
            tenant_id: "tenant-1",
            email: "u1@example.com",
            display_name: "User One",
            role: "member",
            is_super_admin: false,
            phone: null,
            initials: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      })
    );

    const response = await app.request("/api/users", {
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<{ id: string }> };
    expect(body.data[0]?.id).toBe("u1");
  });

  /**
   * `GET /api/users` is open to every member of the tenant on purpose — the
   * copilot mention picker and the team modals need it. The payload is what has
   * to stay narrow, so this pins the wire shape for a plain member.
   *
   * The DAL double below returns a row *carrying* the private columns, which is
   * the only way this file can test the boundary: the routes are exercised
   * against a fake `CoreUsersDal`, so a `select("*")` in the real DAL is
   * invisible here. The projection is pinned separately in
   * `dal/core-users/crud.test.ts`; this covers the second wall.
   */
  it("omits private profile fields from GET /api/users for a non-admin member", async () => {
    const app = createApp(
      makeDal({
        resolveAuthUser: async () =>
          ({
            id: "u-self",
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
          }) as never,
        isAuthUserAdmin: async () => false,
        listUsers: async () =>
          [
            {
              id: "u1",
              tenant_id: "tenant-1",
              email: "u1@example.com",
              display_name: "User One",
              role: "member",
              is_super_admin: false,
              phone: "+43 1 234",
              initials: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              private_phone: "+43 660 000000",
              private_email: "u1@personal.example",
              private_address: "Hauptstrasse 1, 1010 Wien",
              emergency_contact: "Partner, +43 660 111111",
              employee_number: "E-0001",
            },
          ] as never,
      })
    );

    const response = await app.request("/api/users", {
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: Record<string, unknown>[];
    };

    const user = body.data[0];
    expect(user.id).toBe("u1");
    // The work-contact fields a directory legitimately shows.
    expect(user.display_name).toBe("User One");
    expect(user.phone).toBe("+43 1 234");
    for (const field of [
      "private_phone",
      "private_email",
      "private_address",
      "emergency_contact",
      "employee_number",
    ]) {
      expect(user).not.toHaveProperty(field);
    }
    // Nothing beyond the declared contract, whatever the row happens to carry.
    expect(Object.keys(user).sort()).toStrictEqual([
      "created_at",
      "display_name",
      "email",
      "id",
      "initials",
      "is_super_admin",
      "phone",
      "role",
      "tenant_id",
      "updated_at",
    ]);
  });

  it("enforces admin-only role changes through PATCH /api/users/:id", async () => {
    const updateUser = vi.fn(async () => ({
      id: "u2",
      tenant_id: "tenant-1",
      email: "u2@example.com",
      display_name: "User Two",
      role: "admin" as const,
      is_super_admin: false,
      phone: null,
      initials: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const app = createApp(
      makeDal({
        resolveAuthUser: async () =>
          ({
            id: "u-self",
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
          }) as never,
        isAuthUserAdmin: async () => false,
        updateUser,
      })
    );

    const forbidden = await app.request("/api/users/u2", {
      method: "PATCH",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(forbidden.status).toBe(403);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("returns own user via GET /api/users/:id for non-admin session", async () => {
    const app = createApp(
      makeDal({
        resolveAuthUser: async () =>
          ({
            id: "u-self",
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
          }) as never,
        isAuthUserAdmin: async () => false,
        getUserById: async () => ({
          id: "u-self",
          tenant_id: "tenant-1",
          email: "self@example.com",
          display_name: "Self User",
          role: "member",
          is_super_admin: false,
          phone: null,
          initials: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      })
    );
    const response = await app.request("/api/users/u-self", {
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { id: string } };
    expect(body.data.id).toBe("u-self");
  });

  it("allows admin to set another user password via PATCH", async () => {
    const updateUserPassword = vi.fn(async () => undefined);
    const getUserById = vi.fn(async () => ({
      id: "u2",
      tenant_id: "tenant-1",
      email: "u2@example.com",
      display_name: "User Two",
      role: "member" as const,
      is_super_admin: false,
      phone: null,
      initials: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const app = createApp(
      makeDal({
        isAuthUserAdmin: async () => true,
        updateUserPassword,
        getUserById,
      })
    );

    const response = await app.request("/api/users/u2", {
      method: "PATCH",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "new-secret-password" }),
    });
    expect(response.status).toBe(200);
    expect(updateUserPassword).toHaveBeenCalledWith(
      "u2",
      tenantId,
      "new-secret-password"
    );
    expect(getUserById).toHaveBeenCalledWith("u2", tenantId);
  });

  it("rejects password-only PATCH for own account (use Supabase client)", async () => {
    const updateUserPassword = vi.fn(async () => undefined);
    const app = createApp(
      makeDal({
        resolveAuthUser: async () =>
          ({
            id: "u-self",
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
          }) as never,
        isAuthUserAdmin: async () => true,
        updateUserPassword,
      })
    );

    const response = await app.request("/api/users/u-self", {
      method: "PATCH",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "abcdef1" }),
    });
    expect(response.status).toBe(400);
    expect(updateUserPassword).not.toHaveBeenCalled();
  });

  it("allows non-admin self profile update when role is unchanged", async () => {
    const updateUser = vi.fn(async () => ({
      id: "u-self",
      tenant_id: "tenant-1",
      email: "self@example.com",
      display_name: "Updated Name",
      role: "member" as const,
      is_super_admin: false,
      phone: null,
      initials: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const app = createApp(
      makeDal({
        resolveAuthUser: async () =>
          ({
            id: "u-self",
            app_metadata: {},
            user_metadata: {},
            aud: "authenticated",
            created_at: new Date().toISOString(),
          }) as never,
        isAuthUserAdmin: async () => false,
        updateUser,
      })
    );

    const response = await app.request("/api/users/u-self", {
      method: "PATCH",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ display_name: "Updated Name" }),
    });
    expect(response.status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      "u-self",
      tenantId,
      expect.objectContaining({ display_name: "Updated Name", role: undefined })
    );
  });

  it("creates and deletes users when requester is admin", async () => {
    const createUser = vi.fn(async () => ({
      id: "u-new",
      tenant_id: "tenant-1",
      email: "new@example.com",
      display_name: "New User",
      role: "member" as const,
      is_super_admin: false,
      phone: null,
      initials: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const del = vi.fn(async () => {});
    const app = createApp(
      makeDal({
        isAuthUserAdmin: async () => true,
        createUser,
        deleteUser: del,
      })
    );

    const created = await app.request("/api/users", {
      method: "POST",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "new@example.com",
        password: "strong-password",
        display_name: "New User",
        role: "member",
        is_super_admin: false,
      }),
    });
    expect(created.status).toBe(200);
    expect(createUser).toHaveBeenCalledTimes(1);

    const deleted = await app.request("/api/users/u-new", {
      method: "DELETE",
      headers: { authorization: "Bearer supabase-token" },
    });
    expect(deleted.status).toBe(200);
    expect(del).toHaveBeenCalledWith("u-new", tenantId);
  });

  it("allows phone to be null when creating a user", async () => {
    const createUser = vi.fn(async () => ({
      id: "u-new",
      tenant_id: tenantId,
      email: "new@example.com",
      role: "member" as const,
      is_super_admin: false,
      display_name: "New User",
      initials: null,
      phone: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const app = createApp(
      makeDal({
        createUser,
      })
    );

    const res = await app.request("/api/users", {
      method: "POST",
      headers: {
        authorization: "Bearer supabase-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: "new@example.com",
        password: "pass",
        display_name: "New User",
        role: "member",
        is_super_admin: false,
        phone: null,
      }),
    });

    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        phone: null,
      })
    );
  });
});
