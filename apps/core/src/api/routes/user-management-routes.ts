import type { OpenAPIHono } from "@hono/zod-openapi";
import { type CoreUsersDal, createCoreUsersDal } from "../../dal/core-users.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import { createSupabaseClientFromConfig } from "../../security/auth-stores/supabase.js";
import { registerSystemDatabaseHealthRoute } from "./system/register-database-health-route.js";
import { registerUserManagementCrudRoutes } from "./user-management/crud-routes.js";
import { registerUserManagementSetupRoutes } from "./user-management/setup-routes.js";

export function registerUserManagementRoutes(params: {
  app: OpenAPIHono;
  auditLog?: SecurityAuditLogAdapter;
  config: Record<string, unknown>;
  dalFactory?: (config: Record<string, unknown>) => CoreUsersDal;
  /** Module ids the loaded registry ships; null when there is no registry. */
  installedModuleIds?: () => readonly string[] | null;
}) {
  const getDal = () => (params.dalFactory ?? createCoreUsersDal)(params.config);

  registerUserManagementSetupRoutes({
    app: params.app,
    config: params.config,
    getDal,
    setupChecks: {
      getServiceClient: () => createSupabaseClientFromConfig(params.config),
      installedModuleIds: () => params.installedModuleIds?.() ?? null,
    },
  });
  registerUserManagementCrudRoutes({
    app: params.app,
    auditLog: params.auditLog,
    config: params.config,
    getDal,
  });
  registerSystemDatabaseHealthRoute({
    app: params.app,
    config: params.config,
    getDal,
  });
}
