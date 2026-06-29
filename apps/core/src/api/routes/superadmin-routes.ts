import type { OpenAPIHono } from "@hono/zod-openapi";
import { createSuperadminDal } from "../../dal/superadmin.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

export function registerSuperadminRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
}) {
  const getDal = () => createSuperadminDal(params.config);

  params.app.get("/api/superadmin/tenants", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenants = await getDal().listTenants();
    return jsonApiSuccess(c, tenants);
  });

  params.app.get("/api/superadmin/tenants/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const tenant = await getDal().getTenant(tenantId);
    if (!tenant) {
      return jsonApiError(c, 404, { message: "Tenant not found" });
    }
    return jsonApiSuccess(c, tenant);
  });

  params.app.post("/api/superadmin/tenants", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      tenant_connection_mode?: "shared_instance" | "dedicated_instance";
    };
    if (!(body.slug && body.name)) {
      return jsonApiError(c, 400, { message: "slug and name are required" });
    }
    const tenant = await getDal().createTenant({
      slug: body.slug,
      name: body.name,
      tenant_connection_mode: body.tenant_connection_mode ?? "shared_instance",
    });
    return jsonApiSuccess(c, tenant);
  });

  params.app.patch("/api/superadmin/tenants/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      slug?: string;
      name?: string;
      tenant_connection_mode?: "shared_instance" | "dedicated_instance";
    };
    const tenant = await getDal().updateTenant(tenantId, {
      slug: body.slug,
      name: body.name,
      tenant_connection_mode: body.tenant_connection_mode,
    });
    return jsonApiSuccess(c, tenant);
  });

  params.app.post("/api/superadmin/tenants/:id/switch", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    if (!authResult.auth.userId) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    await getDal().switchCurrentUserTenant({
      userId: authResult.auth.userId,
      tenantId,
    });
    return jsonApiSuccess(c, { tenantId });
  });

  params.app.get("/api/superadmin/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.query("tenantId");
    if (tenantId) {
      const users = await getDal().listTenantMembers(tenantId);
      return jsonApiSuccess(c, users);
    }
    const users = await getDal().listUsers();
    return jsonApiSuccess(c, users);
  });

  params.app.get("/api/superadmin/users/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const user = await getDal().getUser(userId);
    if (!user) {
      return jsonApiError(c, 404, { message: "User not found" });
    }
    const [tenant_memberships, identities] = await Promise.all([
      getDal().getUserTenantMemberships(userId),
      getDal().getAuthUserIdentities(userId),
    ]);
    return jsonApiSuccess(c, {
      user,
      tenant_memberships,
      identities,
    });
  });

  params.app.post("/api/superadmin/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: "admin" | "member";
      is_super_admin?: boolean;
    };
    if (!(body.email && body.tenant_id)) {
      return jsonApiError(c, 400, {
        message: "email and tenant_id are required",
      });
    }
    try {
      const user = await getDal().createUser({
        email: body.email,
        password: body.password,
        display_name: body.display_name,
        tenant_id: body.tenant_id,
        role: body.role,
        is_super_admin: body.is_super_admin,
      });
      return jsonApiSuccess(c, user);
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Failed to create user",
      });
    }
  });

  params.app.post("/api/superadmin/users/:id/password", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      newPassword?: string;
    };
    if (!body.newPassword || typeof body.newPassword !== "string") {
      return jsonApiError(c, 400, { message: "newPassword is required" });
    }
    try {
      await getDal().updateUserPassword(userId, body.newPassword);
      return jsonApiSuccess(c, { updated: true });
    } catch (err) {
      return jsonApiError(c, 400, {
        message:
          err instanceof Error ? err.message : "Failed to update password",
      });
    }
  });

  params.app.patch("/api/superadmin/users/:id", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const userId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      display_name?: string;
      tenant_id?: string;
      role?: "admin" | "member";
      is_super_admin?: boolean;
    };
    try {
      const user = await getDal().updateUser(userId, {
        email: body.email,
        password: body.password,
        display_name: body.display_name,
        tenant_id: body.tenant_id,
        role: body.role,
        is_super_admin: body.is_super_admin,
      });
      return jsonApiSuccess(c, user);
    } catch (err) {
      return jsonApiError(c, 400, {
        message: err instanceof Error ? err.message : "Failed to update user",
      });
    }
  });

  params.app.post("/api/superadmin/tenants/:id/users", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      userId?: string;
      role?: "admin" | "member";
    };
    if (!body.userId) {
      return jsonApiError(c, 400, { message: "userId is required" });
    }
    await getDal().assignUserToTenant({
      userId: body.userId,
      tenantId,
      role: body.role ?? "member",
    });
    return jsonApiSuccess(c, { assigned: true });
  });

  params.app.patch("/api/superadmin/tenants/:id/users/:userId", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const userId = c.req.param("userId");
    const body = (await c.req.json().catch(() => ({}))) as {
      role?: "admin" | "member";
    };
    if (!body.role) {
      return jsonApiError(c, 400, { message: "role is required" });
    }
    await getDal().updateTenantMemberRole({
      userId,
      tenantId,
      role: body.role,
    });
    return jsonApiSuccess(c, { updated: true });
  });

  params.app.delete("/api/superadmin/tenants/:id/users/:userId", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const userId = c.req.param("userId");
    await getDal().removeUserFromTenant({ userId, tenantId });
    return jsonApiSuccess(c, { removed: true });
  });

  params.app.get("/api/superadmin/tenants/:id/automation-rules", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const hookId = c.req.query("hookId")?.trim() || undefined;
    const rules = await getDal().listAutomationRules(tenantId, { hookId });
    return jsonApiSuccess(c, rules);
  });

  params.app.post("/api/superadmin/tenants/:id/automation-rules", async (c) => {
    const authResult = await requireSuperAdmin(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as {
      hook_id?: string;
      enabled?: boolean;
      filter_json?: Record<string, unknown>;
      effect_type?: "action" | "agent";
      effect_id?: string;
      effect_input_json?: Record<string, unknown> | null;
    };
    if (!(body.hook_id && body.effect_type && body.effect_id)) {
      return jsonApiError(c, 400, {
        message: "hook_id, effect_type, and effect_id are required",
      });
    }
    try {
      const row = await getDal().createAutomationRule(tenantId, {
        hook_id: body.hook_id,
        enabled: body.enabled,
        filter_json: body.filter_json,
        effect_type: body.effect_type,
        effect_id: body.effect_id,
        effect_input_json: body.effect_input_json,
      });
      return jsonApiSuccess(c, row);
    } catch (err) {
      return jsonApiError(c, 400, {
        message:
          err instanceof Error
            ? err.message
            : "Failed to create automation rule",
      });
    }
  });

  params.app.patch(
    "/api/superadmin/tenants/:id/automation-rules/:ruleId",
    async (c) => {
      const authResult = await requireSuperAdmin(c, params.config);
      if ("error" in authResult) {
        return authResult.error;
      }
      const tenantId = c.req.param("id");
      const ruleId = c.req.param("ruleId");
      const body = (await c.req.json().catch(() => ({}))) as {
        enabled?: boolean;
        hook_id?: string;
        filter_json?: Record<string, unknown>;
        effect_type?: "action" | "agent";
        effect_id?: string;
        effect_input_json?: Record<string, unknown> | null;
      };
      try {
        const row = await getDal().patchAutomationRule(tenantId, ruleId, body);
        return jsonApiSuccess(c, row);
      } catch (err) {
        return jsonApiError(c, 400, {
          message:
            err instanceof Error
              ? err.message
              : "Failed to update automation rule",
        });
      }
    }
  );

  params.app.delete(
    "/api/superadmin/tenants/:id/automation-rules/:ruleId",
    async (c) => {
      const authResult = await requireSuperAdmin(c, params.config);
      if ("error" in authResult) {
        return authResult.error;
      }
      const tenantId = c.req.param("id");
      const ruleId = c.req.param("ruleId");
      try {
        await getDal().deleteAutomationRule(tenantId, ruleId);
        return jsonApiSuccess(c, { deleted: true });
      } catch (err) {
        return jsonApiError(c, 400, {
          message:
            err instanceof Error
              ? err.message
              : "Failed to delete automation rule",
        });
      }
    }
  );
}
