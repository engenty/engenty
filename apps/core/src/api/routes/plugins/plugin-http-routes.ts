import { formatZodErrorForApiError, isZodError } from "@engenty/api-contracts";
import type { createApprovalService } from "@engenty/approvals-sdk";
import type { PluginHttpRoute } from "@engenty/plugin-sdk";
import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthUnavailableError } from "../../../dal/core-users/auth.js";
import { accessibleSpaceIds } from "../../../dal/space-membership.js";
import { resolveSpaceResourceSurface } from "../../../dal/space-mounts.js";
import type { TenantPluginOverridesDal } from "../../../dal/tenant-plugin-overrides.js";
import { resolvePluginCapability } from "../../../plugins/capability-resolver.js";
import type { PluginRegistry } from "../../../plugins/registry.js";
import {
  emitApprovalRequested,
  fileApprovalRequest,
} from "../../../security/approval-gate.js";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { buildExecutedAuditDetail } from "../../../security/audit-relevance.js";
import { recordModuleAuditEvent } from "../../../security/audit-service.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import { InProcessPolicyError } from "../../../security/in-process-gate.js";
import {
  evaluatePolicy,
  evaluateResultPolicy,
  type PolicyDeps,
} from "../../../security/policy.js";
import { isApprovedEdge } from "../../../security/principal-link.js";
import {
  getHttpRouteCapability,
  getRegisteredHttpRouteCapabilities,
} from "../../plugin-route-capabilities.js";
import { jsonApiError } from "../api-response.js";
import type { ApiLogger } from "../types.js";
import { withRequestPrincipalHeaders } from "./module-operation-auth.js";
import {
  handlerAuth,
  InvokeOperationError,
  invokeOperation,
} from "./module-operation-routes.js";
import {
  normalizeRouteResponses,
  serializePluginRouteResult,
} from "./plugin-http-response.js";
import {
  findForbiddenSpaceScope,
  findUnmountedModuleSpace,
  pluginSpaceScopeSubject,
} from "./plugin-space-scope.js";

interface RouteOperationMeta {
  audit?: "always" | "never";
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
    getTenantDb?: ((auth: { tenantId: string }) => SupabaseClient) | null;
    resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
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
    let auth: Awaited<ReturnType<typeof params.authProvider.resolvePrincipal>>;
    try {
      auth = await params.authProvider.resolvePrincipal(
        c.req.header("authorization")
      );
    } catch (error) {
      if (error instanceof AuthUnavailableError) {
        // Never 401 here: the session was not rejected, it could not be
        // checked. Saying "Unauthorized" sends users to re-login for an
        // outage they cannot fix.
        return jsonApiError(c, 503, {
          message: "Authentication service unavailable — please retry.",
        }) as never;
      }
      throw error;
    }
    if (!(auth || route.isPublic)) {
      return jsonApiError(c, 401, { message: "Unauthorized" }) as never;
    }
    if (auth) {
      auth = withRequestPrincipalHeaders(auth, (name) => c.req.header(name));
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
    //
    // No space check here, and not by oversight: a public route has no principal
    // and no tenant, so there is no membership to test against and nothing for
    // the gate to compare. A public route that took a `space_id` and returned a
    // space's contents would be a hole this gate cannot close — the fix for that
    // would be forbidding the combination at registration, not a check that
    // cannot decide. None exists today.
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
      {
        approvalService: params.approvalService,
        resolveAgentApproval: params.resolveAgentApproval,
      }
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
          riskLevel: operation?.riskLevel ?? "medium",
          requiresApproval: operation?.requiresApproval ?? false,
        },
      }) as never;
    }

    const moduleId = operation?.moduleId ?? params.pluginId;
    const riskLevel = operation?.riskLevel ?? "medium";
    const requiresApproval = operation?.requiresApproval ?? false;
    const requiredCapabilities = operation?.requiredCapabilities ?? [];
    const auditRelevance = {
      audit: operation?.audit,
      method: route.method,
      operationId,
      path: route.path,
      requiredCapabilities,
      requiresApproval,
      riskLevel,
    };
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

    // Before the handler, and before any capability or approval logic that
    // assumes the request is about the caller's own data: a `space_id` the caller
    // may not enter is refused here for EVERY module route at once
    // (PLAN-spaces.md Phase P4).
    const forbiddenSpace = await findForbiddenSpaceScope({
      auth,
      getTenantDb: params.getTenantDb ?? null,
      params: paramsParsed,
      query: queryParsed,
    });
    if (forbiddenSpace) {
      return jsonApiError(c, 404, { message: "Space not found" }) as never;
    }
    const routeModuleId = operation?.moduleId ?? params.pluginId;
    const tenantDbFor = (tenantId: string) =>
      params.getTenantDb ? params.getTenantDb({ tenantId }) : null;
    // A write that names a space this module is not mounted in is refused for
    // every space-placed module at once.
    const unmountedSpace = await findUnmountedModuleSpace({
      body,
      method: route.method,
      moduleId: routeModuleId,
      placement:
        params.registry.plugins.find((plugin) => plugin.id === routeModuleId)
          ?.placement ?? null,
      query: queryParsed,
      resolveMountedModules: async (spaceId) => {
        const client = auth ? tenantDbFor(auth.tenantId) : null;
        if (!(client && auth)) {
          return null;
        }
        const surface = await resolveSpaceResourceSurface(
          client,
          auth.tenantId,
          spaceId
        );
        return new Set(surface.modules.map((entry) => entry.moduleId));
      },
    });
    if (unmountedSpace) {
      return jsonApiError(c, 400, {
        code: "space_module_not_mounted",
        message: `${routeModuleId} is not mounted in this space`,
      }) as never;
    }
    // Space ids the caller may see, for a handler listing ACROSS spaces.
    // Computed on demand — most routes never ask — and by the same subject
    // rule as the gate above.
    const accessibleSpaceIdsForCaller = async (): Promise<string[]> => {
      const client = auth ? tenantDbFor(auth.tenantId) : null;
      if (!(client && auth)) {
        return [];
      }
      return [
        ...(await accessibleSpaceIds(
          client,
          auth.tenantId,
          pluginSpaceScopeSubject(auth)
        )),
      ];
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
        accessibleSpaceIds: accessibleSpaceIdsForCaller,
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
        auth: handlerAuth(
          auth,
          isApprovedEdge({
            action: policy.action,
            requiresApproval: operation?.requiresApproval ?? false,
            riskLevel: operation?.riskLevel ?? "medium",
          }),
          scopeId
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
          detail: buildExecutedAuditDetail({
            transport: "http",
            riskLevel,
            principalType: auth.principalType,
            agentId: auth.agentId,
            goalId: auth.goalId,
          }),
        },
        { component: "plugin-http" },
        auditRelevance
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
        detail: buildExecutedAuditDetail({
          transport: "http",
          riskLevel,
          principalType: auth.principalType,
          agentId: auth.agentId,
          goalId: auth.goalId,
        }),
      },
      { component: "plugin-http" },
      auditRelevance
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
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
}) {
  const resolveTenantPluginOverrides = params.tenantPluginOverrides
    ? (tenantId: string) => params.tenantPluginOverrides!.getOverrides(tenantId)
    : undefined;

  // Read off the registry rather than added to this function's signature: every
  // caller already builds the registry, and a new required param would be one
  // more place to forget the space gate.
  const getTenantDb = (params.registry.getTenantDb ?? null) as
    | ((auth: { tenantId: string }) => SupabaseClient)
    | null;

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
      getTenantDb,
      ...(params.resolveAgentApproval
        ? { resolveAgentApproval: params.resolveAgentApproval }
        : {}),
    });
  }
}
