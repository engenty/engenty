import { capabilityCovers } from "@engenty/plugin-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createClient } from "@supabase/supabase-js";
import { createCoreUsersDal } from "../../dal/core-users.js";
import {
  assignRole,
  listAssignmentsForTenant,
  unassignRole,
} from "../../dal/role-assignments.js";
import { resolveSupabaseConfig } from "../../dal/supabase-config.js";
import {
  createTenantRole,
  deleteTenantRole,
  getTenantRole,
  listTenantRoles,
  updateTenantRole,
} from "../../dal/tenant-roles.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../security/audit-service.js";
import {
  getSecuritySecret,
  type PrincipalContext,
} from "../../security/auth.js";
import { validateCustomRole } from "../../security/custom-role-validation.js";
import type { GrantsService } from "../../security/grants-service.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { signPrincipalToken } from "./auth/auth-routes.js";
import { readBearerToken, resolveRouteAuth } from "./authz.js";

// Delegates to the shared plugin-sdk matcher (single source of truth) so this
// gate can't drift from server enforcement — and correctly treats
// `core.superadmin` as covering management, which the old inline check missed.
function coversManage(capabilities: string[]): boolean {
  return (
    capabilityCovers(capabilities, "core.users.manage") ||
    capabilityCovers(capabilities, "core.roles.manage")
  );
}

// Superadmin-tier capabilities. A role carrying any of these (the built-in
// core.superadmin / tenant.admin profiles) is an escalation vector, so only a
// genuine platform superadmin may hand it out. Custom roles can never contain
// these — validateCustomRole rejects wildcards on creation.
const SUPER_TIER_CAPS = ["*", "core.*", "core.superadmin"];
function grantsSuperTier(capabilities: string[]): boolean {
  return capabilities.some((cap) => SUPER_TIER_CAPS.includes(cap));
}

// Map a raw Postgres foreign-key violation (assigning to a user who isn't a
// member of the tenant, or an agent id from another tenant) to a clean 400
// instead of letting it surface as a 500 with the raw DB message.
function isForeignKeyViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "23503" || /foreign key/i.test(message);
}

export function registerAuthzRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  registry: PluginRegistry;
  grants: GrantsService;
  auditLog?: SecurityAuditLogAdapter;
}) {
  const { app, config, registry, grants, auditLog } = params;

  const serviceClient = () => {
    const { url, serviceRoleKey } = resolveSupabaseConfig(config);
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  };

  // Can the caller manage role assignments? Superadmin, an explicit manage
  // capability, or a tenant admin (session tokens carry no capabilities, so
  // fall back to a DAL admin check).
  async function canManage(
    c: { req: { header: (n: string) => string | undefined } },
    auth: { isSuperAdmin: boolean; capabilities: string[] }
  ): Promise<boolean> {
    if (auth.isSuperAdmin || coversManage(auth.capabilities)) {
      return true;
    }
    const token = readBearerToken(c.req.header("authorization"));
    if (!token) {
      return false;
    }
    try {
      return await createCoreUsersDal(config).isAuthUserAdmin(token);
    } catch {
      return false;
    }
  }

  // Every concrete capability the catalog knows about (from gateway-method
  // contracts). Used to reject typo-capabilities in custom roles.
  function capabilityCatalog(): Set<string> {
    const set = new Set<string>();
    for (const entry of registry.moduleOperations ?? []) {
      for (const cap of entry.operation.requiredCapabilities ?? []) {
        set.add(cap);
      }
    }
    return set;
  }

  // The acting user's effective capabilities — used to clamp custom-role
  // capabilities to what the creator actually holds. Superadmins hold "*".
  async function actingUserCapabilities(auth: {
    userId: string | null;
    tenantId: string | null;
    isSuperAdmin: boolean;
  }): Promise<string[]> {
    if (auth.isSuperAdmin) {
      return ["*"];
    }
    if (!(auth.userId && auth.tenantId)) {
      return [];
    }
    const db = serviceClient();
    const roleRow = await db
      .schema("core")
      .from("user_tenant_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .eq("tenant_id", auth.tenantId)
      .maybeSingle();
    const role = (roleRow.data as { role?: string } | null)?.role;
    const resolved = await grants.resolveGrants(
      {
        kind: "user",
        id: auth.userId,
        isSuperAdmin: false,
        tenantRole:
          role === "admin" ? "admin" : role === "member" ? "member" : null,
      },
      auth.tenantId
    );
    return resolved.capabilities;
  }

  // Registry list of role profiles (id, title, description, capabilities,
  // system flag, source plugin). Any authenticated principal may read.
  app.get("/api/authz/roles", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const roles = (registry.roleProfiles?.listWithSource() ?? []).map(
      ({ profile, pluginId }) => ({
        id: profile.id,
        title: profile.title,
        description: profile.description ?? null,
        capabilities: profile.capabilities,
        system: profile.system ?? false,
        source: pluginId,
      })
    );
    return jsonApiSuccess(c, { roles });
  });

  // Capability catalog derived from registered gateway-method contracts: for
  // each capability, the operations that require it plus their risk/approval
  // metadata. Feeds the roles & permissions console and doubles as module-API
  // docs. No new bookkeeping — read straight from the ops registry.
  app.get("/api/authz/capabilities", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const byCapability = new Map<
      string,
      Array<{
        operationId: string;
        moduleId: string;
        riskLevel: string;
        requiresApproval: boolean;
      }>
    >();
    for (const entry of registry.moduleOperations ?? []) {
      const op = entry.operation;
      for (const capability of op.requiredCapabilities ?? []) {
        const list = byCapability.get(capability) ?? [];
        list.push({
          operationId: op.operationId,
          moduleId: op.moduleId,
          riskLevel: op.riskLevel,
          requiresApproval: op.requiresApproval,
        });
        byCapability.set(capability, list);
      }
    }
    const capabilities = [...byCapability.entries()]
      .map(([capability, operations]) => ({ capability, operations }))
      .sort((a, b) => a.capability.localeCompare(b.capability));
    return jsonApiSuccess(c, { capabilities });
  });

  // Effective grants for a user or agent: base role + assignments resolved to
  // the capability union — the same resolveGrants the enforcement path uses.
  app.get(
    "/api/tenants/:tenantId/effective-grants/:subjectKind/:subjectId",
    async (c) => {
      const auth = await resolveRouteAuth(c, config);
      if (!auth) {
        return jsonApiError(c, 401, { message: "Unauthorized" });
      }
      const tenantId = c.req.param("tenantId");
      const subjectKind = c.req.param("subjectKind");
      const subjectId = c.req.param("subjectId");
      if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
        return jsonApiError(c, 403, { message: "Forbidden" });
      }
      if (subjectKind !== "user" && subjectKind !== "agent") {
        return jsonApiError(c, 400, {
          message: "subjectKind must be 'user' or 'agent'",
        });
      }

      let subject: Parameters<typeof grants.resolveGrants>[0] | null = null;
      if (subjectKind === "agent") {
        subject = { kind: "agent", id: subjectId };
      } else {
        const db = serviceClient();
        const [userRow, roleRow] = await Promise.all([
          db
            .schema("core")
            .from("users")
            .select("is_super_admin")
            .eq("id", subjectId)
            .eq("tenant_id", tenantId)
            .maybeSingle(),
          db
            .schema("core")
            .from("user_tenant_roles")
            .select("role")
            .eq("user_id", subjectId)
            .eq("tenant_id", tenantId)
            .maybeSingle(),
        ]);
        const role = (roleRow.data as { role?: string } | null)?.role;
        subject = {
          kind: "user",
          id: subjectId,
          isSuperAdmin: Boolean(
            (userRow.data as { is_super_admin?: boolean } | null)
              ?.is_super_admin
          ),
          tenantRole:
            role === "admin" ? "admin" : role === "member" ? "member" : null,
        };
      }
      const resolved = await grants.resolveGrants(subject, tenantId);
      return jsonApiSuccess(c, resolved);
    }
  );

  app.get("/api/tenants/:tenantId/role-assignments", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    // A caller may only read assignments in their own tenant (superadmin any).
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const assignments = await listAssignmentsForTenant(
      serviceClient(),
      tenantId
    );
    return jsonApiSuccess(c, { assignments });
  });

  app.post("/api/tenants/:tenantId/role-assignments", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (!(await canManage(c, auth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const body = (await c.req.json().catch(() => null)) as {
      roleId?: string;
      subjectKind?: "user" | "agent";
      subjectId?: string;
    } | null;
    if (
      !body?.roleId ||
      (body.subjectKind !== "user" && body.subjectKind !== "agent") ||
      !body.subjectId
    ) {
      return jsonApiError(c, 400, {
        message: "roleId, subjectKind ('user'|'agent') and subjectId required",
      });
    }
    // Resolve the role being assigned. Reject unknown ids, and block handing
    // out a superadmin-tier built-in role (core.superadmin / tenant.admin)
    // unless the caller is a genuine platform superadmin — otherwise any tenant
    // admin could escalate a user or agent to superadmin-equivalent.
    const builtinRole = registry.roleProfiles?.get(body.roleId);
    const isCustomRole = body.roleId.startsWith("custom.");
    if (!(builtinRole || isCustomRole)) {
      return jsonApiError(c, 400, { message: `Unknown role: ${body.roleId}` });
    }
    if (isCustomRole) {
      const custom = await getTenantRole(
        serviceClient(),
        tenantId,
        body.roleId
      );
      if (!custom) {
        return jsonApiError(c, 404, {
          message: `Unknown role: ${body.roleId}`,
        });
      }
    }
    if (
      builtinRole &&
      grantsSuperTier(builtinRole.capabilities) &&
      !auth.isPlatformSuperAdmin
    ) {
      return jsonApiError(c, 403, {
        message: "Only a platform superadmin may assign a superadmin-tier role",
      });
    }
    let row: Awaited<ReturnType<typeof assignRole>>;
    try {
      row = await assignRole(serviceClient(), {
        tenantId,
        roleId: body.roleId,
        subject: { kind: body.subjectKind, id: body.subjectId },
        createdBy: auth.userId,
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        return jsonApiError(c, 400, {
          message:
            "Subject not found in this tenant — a user must be a member and an agent must belong to the tenant.",
        });
      }
      throw error;
    }
    grants.invalidate(tenantId, body.subjectId);
    if (auditLog) {
      recordCoreAuditEvent(
        auditLog,
        {
          type: "authz.role_assigned",
          actorId: auth.userId ?? "unknown",
          tenantId,
          moduleId: "authz",
          operationId: "role_assignments_post",
          detail: {
            role_id: body.roleId,
            subject_kind: body.subjectKind,
            subject_id: body.subjectId,
          },
        },
        { component: "authz-routes" }
      );
    }
    return jsonApiSuccess(c, { assignment: row });
  });

  app.delete("/api/tenants/:tenantId/role-assignments", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (!(await canManage(c, auth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const body = (await c.req.json().catch(() => null)) as {
      roleId?: string;
      subjectKind?: "user" | "agent";
      subjectId?: string;
    } | null;
    if (
      !body?.roleId ||
      (body.subjectKind !== "user" && body.subjectKind !== "agent") ||
      !body.subjectId
    ) {
      return jsonApiError(c, 400, {
        message: "roleId, subjectKind ('user'|'agent') and subjectId required",
      });
    }
    await unassignRole(serviceClient(), {
      tenantId,
      roleId: body.roleId,
      subject: { kind: body.subjectKind, id: body.subjectId },
    });
    grants.invalidate(tenantId, body.subjectId);
    if (auditLog) {
      recordCoreAuditEvent(
        auditLog,
        {
          type: "authz.role_unassigned",
          actorId: auth.userId ?? "unknown",
          tenantId,
          moduleId: "authz",
          operationId: "role_assignments_delete",
          detail: {
            role_id: body.roleId,
            subject_kind: body.subjectKind,
            subject_id: body.subjectId,
          },
        },
        { component: "authz-routes" }
      );
    }
    return jsonApiSuccess(c, { ok: true });
  });

  // Phase 4 §6.3 — mint a short-lived per-agent token for autonomous runs.
  // Service-JWT-guarded: only a service principal (the AI dispatcher) may ask
  // for an agent's token. The token carries the agent's role-derived caps +
  // role_profiles; goal id is passed per-request via header, not baked in.
  app.post("/api/auth/agent-token", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    if (auth.principalType !== "service" && !auth.isPlatformSuperAdmin) {
      return jsonApiError(c, 403, {
        message: "Only a service principal may mint agent tokens",
      });
    }
    const body = (await c.req.json().catch(() => null)) as {
      agentId?: string;
      tenantId?: string;
      ttlSeconds?: number;
    } | null;
    const tenantId = body?.tenantId ?? auth.tenantId;
    if (!(body?.agentId && tenantId)) {
      return jsonApiError(c, 400, { message: "agentId and tenantId required" });
    }
    const grantsForAgent = await grants.resolveGrants(
      { kind: "agent", id: body.agentId },
      tenantId
    );
    // Clamp TTL to <= 1h, no refresh (short-lived per the plan).
    const ttl = Math.min(Math.max(body.ttlSeconds ?? 3600, 60), 3600);
    const principal: PrincipalContext = {
      principalId: body.agentId,
      principalType: "agent",
      tenantId,
      authMethod: "service_credential",
      tokenType: "access",
      capabilities: grantsForAgent.capabilities,
      roleProfiles: grantsForAgent.roleProfiles,
      roles: [],
      permissions: [],
      delegationChain: [],
      scopes: [],
      moduleIds: [],
      audience: [],
    };
    const token = await signPrincipalToken({
      secret: getSecuritySecret(config),
      principal,
      tokenType: "access",
      expiresInSeconds: ttl,
    });
    return jsonApiSuccess(c, { token, expiresInSeconds: ttl });
  });

  // ---- Phase 7: tenant-defined custom roles ----

  app.get("/api/tenants/:tenantId/roles", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const roles = await listTenantRoles(serviceClient(), tenantId);
    return jsonApiSuccess(c, { roles });
  });

  app.post("/api/tenants/:tenantId/roles", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (!(await canManage(c, auth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const body = (await c.req.json().catch(() => null)) as {
      roleId?: string;
      title?: string;
      description?: string | null;
      capabilities?: string[];
    } | null;
    if (!(body?.roleId && body.title && Array.isArray(body.capabilities))) {
      return jsonApiError(c, 400, {
        message: "roleId, title and capabilities[] required",
      });
    }
    const validation = validateCustomRole({
      roleId: body.roleId,
      capabilities: body.capabilities,
      creatorCapabilities: await actingUserCapabilities(auth),
      catalog: capabilityCatalog(),
    });
    if (!validation.ok) {
      return jsonApiError(c, 400, { message: validation.errors.join("; ") });
    }
    const row = await createTenantRole(serviceClient(), {
      tenantId,
      roleId: body.roleId,
      title: body.title,
      description: body.description ?? null,
      capabilities: validation.capabilities,
      createdBy: auth.userId,
    });
    grants.invalidate(tenantId);
    if (auditLog) {
      recordCoreAuditEvent(
        auditLog,
        {
          type: "authz.role_created",
          actorId: auth.userId ?? "unknown",
          tenantId,
          moduleId: "authz",
          operationId: "roles_post",
          detail: {
            role_id: body.roleId,
            capabilities: validation.capabilities,
          },
        },
        { component: "authz-routes" }
      );
    }
    return jsonApiSuccess(c, { role: row });
  });

  app.patch("/api/tenants/:tenantId/roles/:roleId", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    const roleId = c.req.param("roleId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (!(await canManage(c, auth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    const body = (await c.req.json().catch(() => null)) as {
      title?: string;
      description?: string | null;
      capabilities?: string[];
    } | null;
    if (!body) {
      return jsonApiError(c, 400, { message: "Body required" });
    }
    let capabilities: string[] | undefined;
    if (body.capabilities !== undefined) {
      const validation = validateCustomRole({
        roleId,
        capabilities: body.capabilities,
        creatorCapabilities: await actingUserCapabilities(auth),
        catalog: capabilityCatalog(),
      });
      if (!validation.ok) {
        return jsonApiError(c, 400, { message: validation.errors.join("; ") });
      }
      capabilities = validation.capabilities;
    }
    const row = await updateTenantRole(serviceClient(), {
      tenantId,
      roleId,
      title: body.title,
      description: body.description,
      capabilities,
    });
    if (!row) {
      return jsonApiError(c, 404, { message: "Role not found" });
    }
    grants.invalidate(tenantId);
    if (auditLog) {
      recordCoreAuditEvent(
        auditLog,
        {
          type: "authz.role_updated",
          actorId: auth.userId ?? "unknown",
          tenantId,
          moduleId: "authz",
          operationId: "roles_patch",
          detail: { role_id: roleId, capabilities: row.capabilities },
        },
        { component: "authz-routes" }
      );
    }
    return jsonApiSuccess(c, { role: row });
  });

  app.delete("/api/tenants/:tenantId/roles/:roleId", async (c) => {
    const auth = await resolveRouteAuth(c, config);
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const tenantId = c.req.param("tenantId");
    const roleId = c.req.param("roleId");
    if (!auth.isPlatformSuperAdmin && auth.tenantId !== tenantId) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    if (!(await canManage(c, auth))) {
      return jsonApiError(c, 403, { message: "Forbidden" });
    }
    await deleteTenantRole(serviceClient(), tenantId, roleId);
    grants.invalidate(tenantId);
    if (auditLog) {
      recordCoreAuditEvent(
        auditLog,
        {
          type: "authz.role_deleted",
          actorId: auth.userId ?? "unknown",
          tenantId,
          moduleId: "authz",
          operationId: "roles_delete",
          detail: { role_id: roleId },
        },
        { component: "authz-routes" }
      );
    }
    return jsonApiSuccess(c, { ok: true });
  });
}
