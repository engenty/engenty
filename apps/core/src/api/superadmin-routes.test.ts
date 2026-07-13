import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type {
  CoreTenant,
  SuperadminDal,
  TenantMember,
  TenantRole,
} from "../dal/superadmin.js";
import { registerSuperadminRoutes } from "./routes/superadmin-routes.js";

async function signToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

const CONFIG = {
  securityJwtSecret: "test-secret",
  supabaseUrl: "http://127.0.0.1:54321",
  supabaseServiceRoleKey: "test-service-role",
};

/**
 * In-memory SuperadminDal covering the tenant + membership flows the routes
 * exercise. Everything else throws so an accidental dependency surfaces loudly.
 */
function createFakeDal(): SuperadminDal {
  const tenants = new Map<string, CoreTenant>();
  const users = new Map<string, TenantMember>();
  const memberships = new Map<string, Map<string, TenantRole>>(); // tenantId -> userId -> role
  let seq = 0;
  const now = "2026-07-14T00:00:00.000Z";

  const notImplemented = () => {
    throw new Error("not implemented in fake DAL");
  };

  const dal: Partial<SuperadminDal> = {
    async createTenant(input) {
      const id = `tenant-${++seq}`;
      const tenant: CoreTenant = {
        id,
        slug: input.slug,
        name: input.name,
        tenant_connection_mode:
          input.tenant_connection_mode ?? "shared_instance",
        tier: input.tier ?? "platform",
        status: "active",
        created_at: now,
        updated_at: now,
      };
      tenants.set(id, tenant);
      return tenant;
    },
    async listTenants() {
      return [...tenants.values()];
    },
    async getTenant(id) {
      return tenants.get(id) ?? null;
    },
    async updateTenant(id, patch) {
      const current = tenants.get(id);
      if (!current) {
        throw new Error("tenant not found");
      }
      const next = { ...current, ...patch, updated_at: now };
      tenants.set(id, next);
      return next;
    },
    async updateTenantStatus(id, status) {
      const current = tenants.get(id);
      if (!current) {
        throw new Error("tenant not found");
      }
      const next = { ...current, status, updated_at: now };
      tenants.set(id, next);
      return next;
    },
    async createUser(input) {
      const id = `user-${++seq}`;
      const user: TenantMember = {
        id,
        email: input.email,
        display_name: input.display_name ?? null,
        role: input.role ?? "member",
        tenant_id: input.tenant_id,
        tenant_role: input.role ?? "member",
        is_super_admin: input.is_super_admin ?? false,
        created_at: now,
        updated_at: now,
      };
      users.set(id, user);
      return user;
    },
    async assignUserToTenant({ userId, tenantId, role }) {
      const forTenant = memberships.get(tenantId) ?? new Map();
      forTenant.set(userId, role);
      memberships.set(tenantId, forTenant);
    },
    async updateTenantMemberRole({ userId, tenantId, role }) {
      memberships.get(tenantId)?.set(userId, role);
    },
    async removeUserFromTenant({ userId, tenantId }) {
      memberships.get(tenantId)?.delete(userId);
    },
    async listTenantMembers(tenantId) {
      const forTenant = memberships.get(tenantId) ?? new Map();
      return [...forTenant.entries()].map(([userId, role]) => {
        const user = users.get(userId);
        if (!user) {
          throw new Error("member user missing");
        }
        return { ...user, tenant_role: role };
      });
    },
  };

  return new Proxy(dal as SuperadminDal, {
    get(target, prop: string) {
      return (target as Record<string, unknown>)[prop] ?? notImplemented;
    },
  });
}

function createApp(
  resolveSeatLimit: Parameters<
    typeof registerSuperadminRoutes
  >[0]["resolveSeatLimit"] = async () => null
) {
  const app = new OpenAPIHono();
  const dal = createFakeDal();
  registerSuperadminRoutes({
    app,
    config: CONFIG,
    createDal: () => dal,
    resolveSeatLimit,
  });
  return app;
}

async function superadminHeaders() {
  const token = await signToken(["core.superadmin"]);
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

describe("superadmin routes — auth", () => {
  it("rejects missing token", async () => {
    const app = new OpenAPIHono();
    registerSuperadminRoutes({ app, config: CONFIG });
    const response = await app.request("/api/superadmin/tenants");
    expect(response.status).toBe(401);
  });

  it("rejects token without superadmin capability", async () => {
    const app = new OpenAPIHono();
    registerSuperadminRoutes({ app, config: CONFIG });
    const token = await signToken(["core.users.manage"]);
    const response = await app.request("/api/superadmin/tenants", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});

describe("superadmin routes — tenant registry", () => {
  it("creates, changes tier and status, and rejects a bad status", async () => {
    const app = createApp();
    const headers = await superadminHeaders();

    const created = await app.request("/api/superadmin/tenants", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "acme", name: "Acme" }),
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { data: CoreTenant };
    const id = createdBody.data.id;
    expect(createdBody.data.tier).toBe("platform");
    expect(createdBody.data.status).toBe("active");

    const patched = await app.request(`/api/superadmin/tenants/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ tier: "satellite" }),
    });
    expect(patched.status).toBe(200);

    const suspended = await app.request(
      `/api/superadmin/tenants/${id}/status`,
      { method: "POST", headers, body: JSON.stringify({ status: "suspended" }) }
    );
    expect(suspended.status).toBe(200);

    const list = await app.request("/api/superadmin/tenants", { headers });
    const listBody = (await list.json()) as { data: CoreTenant[] };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0]).toMatchObject({
      tier: "satellite",
      status: "suspended",
    });

    const bad = await app.request(`/api/superadmin/tenants/${id}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status: "nope" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("superadmin routes — tenant membership", () => {
  it("assigns, lists, re-roles, and removes a member", async () => {
    const app = createApp();
    const headers = await superadminHeaders();

    const tenantRes = await app.request("/api/superadmin/tenants", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "acme", name: "Acme" }),
    });
    const tenantId = ((await tenantRes.json()) as { data: CoreTenant }).data.id;

    const userRes = await app.request("/api/superadmin/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "u@acme.test", tenant_id: tenantId }),
    });
    const userId = ((await userRes.json()) as { data: { id: string } }).data.id;

    await app.request(`/api/superadmin/tenants/${tenantId}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userId, role: "member" }),
    });

    const listed = await app.request(
      `/api/superadmin/users?tenantId=${tenantId}`,
      { headers }
    );
    const listedBody = (await listed.json()) as { data: TenantMember[] };
    expect(listedBody.data).toHaveLength(1);
    expect(listedBody.data[0]).toMatchObject({
      id: userId,
      tenant_role: "member",
    });

    await app.request(`/api/superadmin/tenants/${tenantId}/users/${userId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ role: "admin" }),
    });
    const afterRole = (await (
      await app.request(`/api/superadmin/users?tenantId=${tenantId}`, {
        headers,
      })
    ).json()) as { data: TenantMember[] };
    expect(afterRole.data[0].tenant_role).toBe("admin");

    await app.request(`/api/superadmin/tenants/${tenantId}/users/${userId}`, {
      method: "DELETE",
      headers,
    });
    const afterRemove = (await (
      await app.request(`/api/superadmin/users?tenantId=${tenantId}`, {
        headers,
      })
    ).json()) as { data: TenantMember[] };
    expect(afterRemove.data).toHaveLength(0);
  });
});

describe("superadmin routes — seat limit (maxUsers)", () => {
  async function seedTenantAtCap(
    app: ReturnType<typeof createApp>,
    headers: Record<string, string>,
    slug: string
  ) {
    const created = await app.request("/api/superadmin/tenants", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug, name: slug }),
    });
    const tenantId = ((await created.json()) as { data: CoreTenant }).data.id;
    // Create a real user, then assign it so the single seat is filled.
    const userRes = await app.request("/api/superadmin/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: `a@${slug}.z`, tenant_id: tenantId }),
    });
    const userId = ((await userRes.json()) as { data: TenantMember }).data.id;
    await app.request(`/api/superadmin/tenants/${tenantId}/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({ userId }),
    });
    return tenantId;
  }

  it("blocks assign + create once the enforced seat cap is reached", async () => {
    const app = createApp(async () => ({
      maxUsers: 1,
      enforcement_mode: "enforce",
    }));
    const headers = await superadminHeaders();
    const tenantId = await seedTenantAtCap(app, headers, "cap");

    // Assigning another member is at the cap (1 >= 1) -> blocked.
    const assign = await app.request(
      `/api/superadmin/tenants/${tenantId}/users`,
      { method: "POST", headers, body: JSON.stringify({ userId: "u2" }) }
    );
    expect(assign.status).toBe(403);
    expect(
      ((await assign.json()) as { error: { code: string } }).error.code
    ).toBe("seat_limit_reached");

    // Creating a user in the tenant is likewise blocked at the cap.
    const create = await app.request("/api/superadmin/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "x@y.z", tenant_id: tenantId }),
    });
    expect(create.status).toBe(403);
  });

  it("allows adds in observe mode even past the cap", async () => {
    const app = createApp(async () => ({
      maxUsers: 1,
      enforcement_mode: "observe",
    }));
    const headers = await superadminHeaders();
    const tenantId = await seedTenantAtCap(app, headers, "obs");
    const create = await app.request("/api/superadmin/users", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: "x@y.z", tenant_id: tenantId }),
    });
    expect(create.status).toBe(200);
  });
});
