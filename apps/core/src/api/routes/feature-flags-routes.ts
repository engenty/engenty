import { groupByNamespace } from "@engenty/feature-flags";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { createCoreUsersDal } from "../../dal/core-users.js";
import { createFeatureFlagsDal } from "../../dal/feature-flags.js";
import { createPackagesDal } from "../../dal/packages.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import { getSecuritySecret, verifyAccessToken } from "../../security/auth.js";
import { jsonApiError, jsonApiSuccess } from "./api-response.js";
import { requireSuperAdmin } from "./authz.js";

function readBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice(7).trim();
}

async function requireAuth(
  c: {
    req: { header: (name: string) => string | undefined };
    json: (body: unknown, status?: number) => Response;
  },
  config: Record<string, unknown>
): Promise<{ tenantId: string | null } | { error: Response }> {
  const authHeader = c.req.header("authorization");
  const auth = await verifyAccessToken(authHeader, getSecuritySecret(config), {
    transport: "rest",
  });
  if (auth) {
    return { tenantId: auth.tenantId || null };
  }
  const sessionToken = readBearerToken(authHeader);
  if (!sessionToken) {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
  try {
    const tenantId =
      await createCoreUsersDal(config).getTenantIdForAuthUser(sessionToken);
    return { tenantId };
  } catch {
    return { error: jsonApiError(c, 401, { message: "Unauthorized" }) };
  }
}

export function registerFeatureFlagsRoutes(params: {
  app: OpenAPIHono;
  registry: PluginRegistry;
  config: Record<string, unknown>;
  createDal?: typeof createFeatureFlagsDal;
  /** Resolve a tenant's commercial-package flag values. Injectable for tests. */
  resolvePackageFlags?: (
    tenantId: string | null
  ) => Promise<Record<string, boolean>>;
}) {
  const { app, registry, config } = params;
  const dal = (params.createDal ?? createFeatureFlagsDal)(config);
  const resolvePackageFlags =
    params.resolvePackageFlags ??
    (async (tenantId: string | null) => {
      if (!tenantId) {
        return {};
      }
      try {
        const resolved =
          await createPackagesDal(config).getResolvedEntitlements(tenantId);
        return resolved.featureFlags;
      } catch {
        // Package resolution must never break flag resolution.
        return {};
      }
    });

  app.get("/api/feature-flags/catalog", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const definitions = registry.featureFlags;
    const grouped = Object.fromEntries(
      Array.from(groupByNamespace(definitions).entries()).map(([ns, defs]) => [
        ns,
        defs,
      ])
    );
    return jsonApiSuccess(c, {
      definitions,
      grouped,
    });
  });

  app.get("/api/feature-flags/resolved", async (c) => {
    const authResult = await requireAuth(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const { tenantId } = authResult;
    const packageFlags = await resolvePackageFlags(tenantId);
    const resolved = await dal.getResolved(
      tenantId,
      registry.featureFlags,
      packageFlags
    );
    return jsonApiSuccess(c, { resolved });
  });

  app.get("/api/feature-flags/manage", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const tenantId =
      c.req.query("tenantId") || authResult.auth.tenantId || null;
    const packageFlags = await resolvePackageFlags(tenantId);
    const {
      global,
      tenant,
      package: pkg,
      resolved,
    } = await dal.getManageData(tenantId, registry.featureFlags, packageFlags);
    return jsonApiSuccess(c, {
      definitions: registry.featureFlags,
      global,
      tenant,
      package: pkg,
      resolved,
      tenantId,
    });
  });

  app.put("/api/feature-flags/manage", async (c) => {
    const authResult = await requireSuperAdmin(c, config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const body = await c.req.json().catch(() => ({}));
    const updates = Array.isArray(body.updates)
      ? (body.updates as Array<{
          key: string;
          tenant_id?: string | null;
          enabled: boolean;
        }>)
      : [];
    const normalized = updates
      .filter(
        (u) => typeof u.key === "string" && typeof u.enabled === "boolean"
      )
      .map((u) => ({
        key: String(u.key).trim(),
        tenant_id:
          u.tenant_id === undefined || u.tenant_id === ""
            ? null
            : String(u.tenant_id),
        enabled: Boolean(u.enabled),
      }))
      .filter((u) => u.key.length > 0);
    await dal.setOverrides(normalized);
    return jsonApiSuccess(c, { saved: true });
  });
}
