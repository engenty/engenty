import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import type { PluginHttpRoute } from "@engenty/plugin-sdk";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { TenantPluginOverridesDal } from "../../../dal/tenant-plugin-overrides.js";
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  emitApprovalRequested,
  fileApprovalRequest,
} from "../../../security/approval-gate.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordModuleAuditEvent } from "../../../security/audit-service.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { InProcessPolicyError } from "../../../security/in-process-gate.js";
import {
  evaluatePolicy,
  evaluateResultPolicy,
} from "../../../security/policy.js";
import {
  isApprovedEdge,
  linkPrincipal,
} from "../../../security/principal-link.js";
import {
  getHttpRouteCapability,
  getRegisteredHttpRouteCapabilities,
} from "../../plugin-route-capabilities.js";
import { jsonApiError } from "../api-response.js";
import type { ApiLogger } from "../types.js";
import {
  InvokeOperationError,
  invokeOperation,
} from "./module-operation-routes.js";
import {
  normalizeRouteResponses,
  serializePluginRouteResult,
} from "./plugin-http-response.js";

interface RouteOperationMeta {
  moduleId?: string;
  operationId?: string;
  requiredCapabilities?: string[];
  requiresApproval?: boolean;
  riskLevel?: "low" | "medium" | "high" | "critical";
}

type TenantPluginOverrideResolver = (
  tenantId: string
) => Promise<Record<string, boolean>>;

function getRouteOperation(
  route: PluginHttpRoute
): RouteOperationMeta | undefined {
  return (route as PluginHttpRoute & { operation?: RouteOperationMeta })
    .operation;
}

function mountPluginRoute(
  app: OpenAPIHono,
  params: {
    route: PluginHttpRoute;
    pluginId: string;
    pluginConfig: Record<string, unknown>;
    config: Record<string, unknown>;
    dataDir: string;
    resolvePath: (p: string) => string;
    getLogger: (c: { get: (k: "evlog") => unknown }) => ApiLogger;
    authProvider: AuthProvider;
    approvalService: ReturnType<typeof createApprovalService>;
    auditLog: SecurityAuditLogAdapter;
    registry: PluginRegistry;
    resolveTenantPluginOverrides?: TenantPluginOverrideResolver;
  }
) {
  const { route } = params;
  const routeSpec = createRoute({
    method: route.method,
    path: route.path,
    summary: route.summary,
    description: route.description,
    tags: route.tags,
    request: {
      params: route.request?.params as never,
      query: route.request?.query as never,
      headers: route.request?.headers as never,
      body: route.request?.body
        ? {
            content: {
              "application/json": {
                schema: route.request.body as never,
              },
            },
          }
        : undefined,
    },
    responses: normalizeRouteResponses(route) as never,
  });

  app.openapi(routeSpec, async (c) => {
    const logger = params.getLogger(c);
    const auth = await params.authProvider.resolvePrincipal(
      c.req.header("authorization")
    );
    if (!(auth || route.isPublic)) {
      return jsonApiError(c, 401, { message: "Unauthorized" }) as never;
    }
    const operation = getRouteOperation(route);
    const operationId = getHttpRouteCapability(params.pluginId, route);
    const tenantPluginOverrides =
      auth && params.resolveTenantPluginOverrides
        ? await params.resolveTenantPluginOverrides(auth.tenantId)
        : {};
    const capabilityResolution = resolvePluginCapability({
      tenantId: auth?.tenantId,
      registry: params.registry,
      pluginId: params.pluginId,
      capability: operationId,
      contributionKind: "http_route",
      registeredCapabilities: getRegisteredHttpRouteCapabilities(
        params.registry,
        params.pluginId
      ),
      tenantPluginOverrides,
    });
    if (!capabilityResolution.allowed) {
      if (auth) {
        recordModuleAuditEvent(
          params.auditLog,
          operation?.moduleId ?? params.pluginId,
          {
            type: "capability.deny",
            actorId: auth.principalId,
            tenantId: auth.tenantId,
            moduleId: operation?.moduleId ?? params.pluginId,
            operationId,
            detail: {
              reason: capabilityResolution.reason,
              diagnostics: capabilityResolution.diagnostics,
            },
          },
          { component: "plugin-http" }
        );
      }
      return jsonApiError(c, 403, {
        code: capabilityResolution.reason,
        message: "HTTP route unavailable",
        details: {
          reason: capabilityResolution.reason,
          diagnostics: capabilityResolution.diagnostics,
        },
      }) as never;
    }
    let body: unknown;
    let paramsParsed: unknown;
    let queryParsed: unknown;
    let headersParsed: Record<string, string>;
    try {
      const bodyRaw = route.request?.body ? await c.req.json() : undefined;
      body = route.request?.body
        ? route.request.body.parse(bodyRaw)
        : undefined;
      paramsParsed = route.request?.params
        ? route.request.params.parse(c.req.param())
        : c.req.param();
      queryParsed = route.request?.query
        ? route.request.query.parse(c.req.query())
        : c.req.query();
      headersParsed = route.request?.headers
        ? (route.request.headers.parse(
            Object.fromEntries(c.req.raw.headers.entries())
          ) as Record<string, string>)
        : Object.fromEntries(c.req.raw.headers.entries());
    } catch (e) {
      if (isZodError(e)) {
        return jsonApiError(c, 400, formatZodErrorForApiError(e)) as never;
      }
      throw e;
    }
    // ── Public routes: skip policy, approval, audit — call handler directly ──
    if (route.isPublic) {
      const scopeId =
        (c.req.header("x-scope-id") ?? c.req.header("X-Scope-Id"))?.trim() ||
        "default";
      let result: unknown;
      try {
        result = await route.handler({
          request: c.req.raw,
          hono: c,
          config: params.config,
          pluginConfig: params.pluginConfig,
          callGatewayMethod: async () => {
            throw new Error("Gateway calls are not available on public routes");
          },
          dataDir: params.dataDir,
          resolvePath: params.resolvePath,
          logger,
          params: paramsParsed,
          query: queryParsed,
          headers: headersParsed,
          body,
          auth: auth
            ? {
                tenantId: auth.tenantId,
                scopeId,
                principalId: auth.principalId,
                principalType: auth.principalType,
                capabilities: auth.capabilities,
              }
            : undefined,
          recordAuditEvent: () => {},
        });
      } catch (e) {
        if (e instanceof InvokeOperationError) {
          const eBody = e.body as Record<string, unknown> | undefined;
          if (
            eBody &&
            typeof eBody.code === "string" &&
            typeof eBody.message === "string"
          ) {
            return jsonApiError(c, e.status, {
              code: eBody.code,
              message: eBody.message,
            }) as never;
          }
          return jsonApiError(c, e.status, {
            message: e.message,
          }) as never;
        }
        throw e;
      }
      if (result instanceof Response) {
        return result as never;
      }
      return (await serializePluginRouteResult(route, result)) as never;
    }

    // Past the public branch, so `route.isPublic` is false — which means the
    // 401 guard above already required a principal. The compiler cannot chain
    // those two conditions, and restating it as a real guard is worth more
    // than a cast: if the guard above ever changes shape, this fails closed
    // rather than dereferencing null.
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" }) as never;
    }

    // ── Authenticated routes: full policy / approval / audit pipeline ──
    const policy = await evaluatePolicy(
      {
        auth,
        moduleId: operation?.moduleId ?? params.pluginId,
        operationId,
        requiredCapabilities: operation?.requiredCapabilities ?? [],
        riskLevel: operation?.riskLevel ?? "medium",
        requiresApproval: operation?.requiresApproval ?? false,
        transport: "http",
        input: {
          params: paramsParsed,
          query: queryParsed,
          headers: headersParsed,
          body,
        },
      },
      params.registry,
      { approvalService: params.approvalService }
    );
    if (policy.action === "deny") {
      recordModuleAuditEvent(
        params.auditLog,
        operation?.moduleId ?? params.pluginId,
        {
          type: "policy.deny",
          actorId: auth!.principalId,
          tenantId: auth!.tenantId,
          moduleId: operation?.moduleId ?? params.pluginId,
          operationId,
          detail: { reason: policy.reason },
        },
        { component: "plugin-http" }
      );
      return jsonApiError(c, 403, {
        message: "Forbidden",
        details: { reason: policy.reason },
      }) as never;
    }
    if (policy.action === "require_approval") {
      // evaluatePolicy already spent any covering grant — this is a real ask.
      const gate = await fileApprovalRequest({
        approvalService: params.approvalService,
        auditLog: params.auditLog,
        auth: auth!,
        component: "plugin-http",
        moduleId: operation?.moduleId ?? params.pluginId,
        operationId,
        onRequested: emitApprovalRequested(params.registry, auth!),
        reason: policy.reason,
        ...(policy.approvalContext ? { context: policy.approvalContext } : {}),
      });
      return jsonApiError(c, 202, {
        code: "approval_required",
        message: "Approval required",
        details: {
          approvalRequestId: gate.approvalRequestId,
          expiresAt: gate.expiresAt,
          reason: gate.reason,
        },
      }) as never;
    }
    recordModuleAuditEvent(
      params.auditLog,
      operation?.moduleId ?? params.pluginId,
      {
        type: "policy.allow",
        actorId: auth!.principalId,
        tenantId: auth!.tenantId,
        moduleId: operation?.moduleId ?? params.pluginId,
        operationId,
        detail: { reason: policy.reason },
      },
      { component: "plugin-http" }
    );

    const moduleId = operation?.moduleId ?? params.pluginId;
    const recordAuditEvent = (event: {
      type: string;
      detail?: Record<string, unknown>;
      operationId?: string;
    }) => {
      recordModuleAuditEvent(
        params.auditLog,
        moduleId,
        {
          type: event.type,
          actorId: auth!.principalId,
          tenantId: auth!.tenantId,
          moduleId,
          operationId: event.operationId ?? operationId,
          detail: event.detail,
        },
        { component: "plugin-http" }
      );
    };

    const scopeId =
      (c.req.header("x-scope-id") ?? c.req.header("X-Scope-Id"))?.trim() ||
      "default";
    const callGatewayMethod = async (
      methodName: string,
      input: unknown,
      _options?: {
        auth?: { tenantId: string; scopeId: string; principalId: string };
      }
    ) => {
      const { data } = await invokeOperation({
        auth,
        registry: params.registry,
        config: params.config,
        dataDir: params.dataDir,
        resolvePath: params.resolvePath,
        operationId: methodName,
        input,
        transport: "http",
        approvalService: params.approvalService,
        auditLog: params.auditLog,
        resolveTenantPluginOverrides: params.resolveTenantPluginOverrides,
      });
      return data;
    };
    let result: unknown;
    try {
      result = await route.handler({
        request: c.req.raw,
        hono: c,
        config: params.config,
        pluginConfig: params.pluginConfig,
        callGatewayMethod,
        dataDir: params.dataDir,
        resolvePath: params.resolvePath,
        logger,
        params: paramsParsed,
        query: queryParsed,
        headers: headersParsed,
        body,
        // principalType/agentId travel with it: a handler that calls another
        // module in-process is re-gated against this same principal, and a
        // context that dropped them would present an agent as an ordinary
        // user — the one principal the escalation policy never gates.
        auth: linkPrincipal(
          {
            tenantId: auth.tenantId,
            scopeId,
            principalId: auth.principalId,
            principalType: auth.principalType,
            capabilities: auth.capabilities,
            ...(auth.agentId ? { agentId: auth.agentId } : {}),
            ...(auth.goalId ? { goalId: auth.goalId } : {}),
          },
          {
            principal: auth,
            approvedEdge: isApprovedEdge({
              action: policy.action,
              requiresApproval: operation?.requiresApproval ?? false,
              riskLevel: operation?.riskLevel ?? "medium",
            }),
          }
        ),
        recordAuditEvent,
      });
    } catch (e) {
      if (e instanceof InProcessPolicyError) {
        // A nested in-process call the gate refused is an authorization
        // answer, not a crash. Handlers that treat the nested call as
        // optional catch it themselves and never reach here.
        return jsonApiError(c, 403, {
          code: "in_process_policy_denied",
          message: e.message,
          details: { reason: e.reason, operationId: e.operationId },
        }) as never;
      }
      if (e instanceof InvokeOperationError) {
        const body = e.body as Record<string, unknown> | undefined;
        if (
          body &&
          typeof body.code === "string" &&
          typeof body.message === "string"
        ) {
          return jsonApiError(c, e.status, {
            code: body.code,
            message: body.message,
            ...(body.details !== undefined && { details: body.details }),
            ...(body.fields !== undefined && {
              fields: body.fields as Record<string, string[]>,
            }),
          }) as never;
        }
        return jsonApiError(c, e.status, {
          message: e.message,
          details: body,
        }) as never;
      }
      throw e;
    }

    if (
      result instanceof Response &&
      (route.responseMode ?? "json") !== "json"
    ) {
      recordModuleAuditEvent(
        params.auditLog,
        operation?.moduleId ?? params.pluginId,
        {
          type: "operation.executed",
          actorId: auth.principalId,
          tenantId: auth.tenantId,
          moduleId: operation?.moduleId ?? params.pluginId,
          operationId,
        },
        { component: "plugin-http" }
      );
      return result as never;
    }
    const resultDecision = evaluateResultPolicy(
      {
        auth,
        moduleId: operation?.moduleId ?? params.pluginId,
        operationId,
        requiredCapabilities: operation?.requiredCapabilities ?? [],
        riskLevel: operation?.riskLevel ?? "medium",
        requiresApproval: operation?.requiresApproval ?? false,
        transport: "http",
        input: {
          params: paramsParsed,
          query: queryParsed,
          headers: headersParsed,
          body,
        },
      },
      result,
      params.registry
    );
    if (resultDecision?.action === "deny") {
      recordModuleAuditEvent(
        params.auditLog,
        operation?.moduleId ?? params.pluginId,
        {
          type: "operation.rejected",
          actorId: auth.principalId,
          tenantId: auth.tenantId,
          moduleId: operation?.moduleId ?? params.pluginId,
          operationId,
          detail: { reason: resultDecision.reason },
        },
        { component: "plugin-http" }
      );
      return jsonApiError(c, 403, {
        message: "Forbidden",
        details: { reason: resultDecision.reason },
      }) as never;
    }
    recordModuleAuditEvent(
      params.auditLog,
      operation?.moduleId ?? params.pluginId,
      {
        type: "operation.executed",
        actorId: auth.principalId,
        tenantId: auth.tenantId,
        moduleId: operation?.moduleId ?? params.pluginId,
        operationId,
      },
      { component: "plugin-http" }
    );
    return (await serializePluginRouteResult(route, result)) as never;
  });
}

export function registerPluginHttpRoutes(params: {
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
}) {
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;

  for (const entry of params.registry.httpRoutes) {
    mountPluginRoute(params.app, {
      route: entry.route,
      pluginId: entry.pluginId,
      pluginConfig: entry.pluginConfig,
      config: params.config,
      dataDir: params.dataDir,
      resolvePath: params.resolvePath,
      getLogger: params.getLogger,
      authProvider: params.authProvider,
      approvalService: params.approvalService,
      auditLog: params.auditLog,
      registry: params.registry,
      resolveTenantPluginOverrides,
    });
  }
}
