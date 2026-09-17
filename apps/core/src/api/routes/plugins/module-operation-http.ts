/**
 * HTTP registration for module-operation contract and invoke routes.
 */
import type { createApprovalService } from "@engenty/approvals-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { TenantPluginOverridesDal } from "../../../dal/tenant-plugin-overrides.js";
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import type { PolicyDeps } from "../../../security/policy.js";
import { buildOperationContracts } from "../../operation-contracts.js";
import { jsonApiSuccess } from "../api-response.js";
import { requireAuth } from "./module-operation-auth.js";
import {
  getAvailableOperationContract,
  listAvailableOperationContracts,
} from "./module-operation-contracts-http.js";
import {
  executeModuleOperation,
  invokeOperationFromRoute,
} from "./module-operation-invoke-http.js";
import {
  createConcreteModuleToolInvokeRoute,
  createConcreteToolInvokeRoute,
  getModuleToolContractRoute,
  getOperationContractRoute,
  getToolContractRoute,
  invokeModuleToolRoute,
  invokeOperationRoute,
  invokeToolRoute,
  listModuleToolContractsRoute,
  listOperationContractsRoute,
  listToolContractsRoute,
  type OperationRoutesContext,
} from "./module-operation-shared.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

export function registerModuleOperationRoutes(params: {
  app: OpenAPIHono;
  registry: PluginRegistry;
  config: Record<string, unknown>;
  dataDir: string;
  resolvePath: (p: string) => string;
  authProvider: AuthProvider;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  tenantPluginOverrides?: TenantPluginOverridesDal;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
}) {
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;
  const context: OperationRoutesContext = {
    registry: params.registry,
    config: params.config,
    dataDir: params.dataDir,
    resolvePath: params.resolvePath,
    authProvider: params.authProvider,
    approvalService: params.approvalService,
    auditLog: params.auditLog,
    resolveTenantPluginOverrides,
    ...(params.resolveAgentApproval
      ? { resolveAgentApproval: params.resolveAgentApproval }
      : {}),
  };

  params.app.openapi(
    listOperationContractsRoute,
    async (c) => listAvailableOperationContracts(c, context) as never
  );

  params.app.openapi(
    getOperationContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        operationId: c.req.param("operationId"),
        publicName: "Operation",
      }) as never
  );

  params.app.openapi(
    invokeOperationRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        operationId: c.req.param("operationId"),
        publicName: "operation",
      }) as never
  );

  params.app.openapi(
    listToolContractsRoute,
    async (c) => listAvailableOperationContracts(c, context) as never
  );

  params.app.openapi(
    getToolContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        operationId: c.req.param("toolId"),
        publicName: "Tool",
      }) as never
  );

  params.app.openapi(
    invokeToolRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        operationId: c.req.param("toolId"),
        publicName: "tool",
      }) as never
  );

  for (const entry of params.registry.moduleOperations) {
    params.app.openapi(
      createConcreteToolInvokeRoute(entry),
      async (c) =>
        invokeOperationFromRoute(c, {
          ...context,
          operationId: entry.operationId,
          publicName: "tool",
        }) as never
    );
  }

  params.app.get("/api/mcp/tools", async (c) => {
    const authResult = await requireAuth(c, params.authProvider);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const tenantPluginOverrides = resolveTenantPluginOverrides
      ? await resolveTenantPluginOverrides(authResult.auth.tenantId)
      : {};
    const tools = buildOperationContracts(params.registry)
      .filter(
        (contract) =>
          resolvePluginCapability({
            tenantId: authResult.auth.tenantId,
            registry: params.registry,
            pluginId: contract.pluginId,
            capability: contract.operationId,
            contributionKind: "mcp_tool",
            registeredCapabilities: params.registry.moduleOperations
              .filter((item) => item.pluginId === contract.pluginId)
              .map((item) => item.operationId),
            tenantPluginOverrides,
          }).allowed
      )
      .map((contract) => ({
        name: contract.operationId,
        description:
          contract.description ?? `${contract.pluginId} module operation`,
        inputSchema: contract.inputSchema,
        requiredCapabilities: contract.auth.requiredCapabilities,
        riskLevel: contract.auth.riskLevel,
        requiresApproval: contract.auth.requiresApproval,
      }));
    return jsonApiSuccess(c, tools);
  });

  params.app.post("/api/mcp/tools/:operationId/call", async (c) => {
    const operationId = c.req.param("operationId");
    const body = (await c.req.json().catch(() => ({}))) as {
      arguments?: unknown;
    };
    return executeModuleOperation({
      c,
      registry: params.registry,
      config: params.config,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      operationId,
      input: body.arguments ?? {},
      transport: "mcp",
      authProvider: params.authProvider,
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      resolveTenantPluginOverrides,
      ...(params.resolveAgentApproval
        ? { resolveAgentApproval: params.resolveAgentApproval }
        : {}),
    });
  });

  params.app.openapi(
    listModuleToolContractsRoute,
    async (c) =>
      listAvailableOperationContracts(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
      }) as never
  );

  params.app.openapi(
    getModuleToolContractRoute,
    async (c) =>
      getAvailableOperationContract(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
        operationId: c.req.param("toolId"),
        publicName: "Tool",
      }) as never
  );

  params.app.openapi(
    invokeModuleToolRoute,
    async (c) =>
      invokeOperationFromRoute(c, {
        ...context,
        moduleId: c.req.param("moduleId"),
        operationId: c.req.param("toolId"),
        publicName: "tool",
      }) as never
  );

  for (const entry of params.registry.moduleOperations) {
    params.app.openapi(
      createConcreteModuleToolInvokeRoute(entry),
      async (c) =>
        invokeOperationFromRoute(c, {
          ...context,
          moduleId: entry.operation.moduleId,
          operationId: entry.operationId,
          publicName: "tool",
        }) as never
    );
  }
}
