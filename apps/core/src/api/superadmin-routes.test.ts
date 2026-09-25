import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type {
  CoreTenant,
  SuperadminDal,
  TenantMember,
  TenantRole,
} from "../dal/superadmin.js";
import { entitlements } from "../lib/entitlements-runtime.js";
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
 * In-memory SuperadminDal for the seat-limit flow. Everything else throws so
 * an accidental dependency surfaces loudly.
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
        package_id: input.package_id ?? null,
        created_at: now,
        updated_at: now,
      };
      tenants.set(id, tenant);
      return tenant;
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
      return (
        (target as unknown as Record<string, unknown>)[prop] ?? notImplemented
      );
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

// Seat caps are enforced by the closed `@engenty/entitlements` package, which
// the public snapshot excludes — without it every request is unmetered.
describe.skipIf(!entitlements)(
  "superadmin routes — seat limit (maxUsers)",
  () => {
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
  }
);

describe("superadmin routes — cross-tenant approvals", () => {
  it("rejects a non-superadmin token", async () => {
    const app = new OpenAPIHono();
    registerSuperadminRoutes({
      app,
      config: CONFIG,
      approvalService: createApprovalService(createFakeApprovalDb().client),
    });
    const token = await signToken(["core.users.manage"]);
    const res = await app.request("/api/superadmin/approvals", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
