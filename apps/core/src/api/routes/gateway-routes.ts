import type { createApprovalService } from "@engenty/approvals-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { TenantPluginOverridesDal } from "../../dal/tenant-plugin-overrides.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import type { AuthProvider } from "../../security/auth-provider.js";
import type { PolicyDeps } from "../../security/policy.js";
import { jsonApiError } from "./api-response.js";
import { executeModuleOperation } from "./plugins/module-operation-routes.js";
import type { ApiLogger } from "./types.js";

function buildGatewayMethodMap(registry: PluginRegistry) {
  return new Map<string, string>(
    registry.gatewayMethods.map((entry) => [
      entry.method.name,
      entry.method.operation?.operationId ?? entry.method.name,
    ])
  );
}

export function registerGatewayRoutes(params: {
  app: OpenAPIHono;
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
  getLogger: (c: { get: (k: "evlog") => unknown }) => ApiLogger;
  authProvider: AuthProvider;
  approvalService: ReturnType<typeof createApprovalService>;
  auditLog: SecurityAuditLogAdapter;
  tenantPluginOverrides?: TenantPluginOverridesDal;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
}) {
  const gatewayMethods = buildGatewayMethodMap(params.registry);
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;
  params.app.post("/gateway/:method", async (c) => {
    const logger = params.getLogger(c);
    const methodName = c.req.param("method");
    const operationId =
      gatewayMethods.get(methodName) ??
      (params.registry.moduleOperations.some(
        (operation) => operation.operationId === methodName
      )
        ? methodName
        : undefined);
    if (!operationId) {
      logger.warn(`Gateway method not found: ${methodName}`);
      return jsonApiError(c, 404, {
        message: `Unknown gateway method: ${methodName}`,
      });
    }

    const inputRaw = await c.req.json().catch(() => ({}));
    return executeModuleOperation({
      c,
      registry: params.registry,
      config: params.config,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      operationId,
      input: inputRaw,
      transport: "gateway",
      authProvider: params.authProvider,
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      resolveTenantPluginOverrides,
      ...(params.resolveAgentApproval
        ? { resolveAgentApproval: params.resolveAgentApproval }
        : {}),
    });
  });
}
