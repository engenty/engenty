import type { createApprovalService } from "@engenty/approvals-sdk";
import { envString } from "@engenty/environment/env";
import {
  buildMcpProtectedResourceMetadata,
  DEFAULT_MCP_OAUTH_SCOPES,
} from "@engenty/mcp-server";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import type { AuthProvider } from "../../security/auth-provider.js";
import { createSupabaseClientFromConfig } from "../../security/auth-stores/supabase.js";
import type { PolicyDeps } from "../../security/policy.js";
import { jsonApiError, jsonApiSuccess } from "../routes/api-response.js";
import { mcpResourceUrl } from "./audience.js";
import type { McpAuthorityResolver } from "./authority.js";
import type { McpClientGrant, McpGrantStore } from "./grants.js";
import {
  createMemoryMcpGrantStore,
  createSupabaseMcpGrantStore,
} from "./grants.js";
import {
  createCoreMcpFetchHandler,
  type EngentyMcpRuntime,
} from "./handler.js";
import {
  assertTaskOwner,
  createMemoryMcpTaskStore,
  createSupabaseMcpTaskStore,
  type McpTaskStore,
} from "./tasks.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

export function registerMcpRoutes(params: {
  app: OpenAPIHono;
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  authProvider: AuthProvider;
  authority: McpAuthorityResolver;
  config: Record<string, unknown>;
  dataDir: string;
  grants?: McpGrantStore;
  registry: PluginRegistry;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolvePath: (p: string) => string;
  tasks?: McpTaskStore;
}): EngentyMcpRuntime {
  const supabase = createSupabaseClientFromConfig(params.config);
  const grants =
    params.grants ??
    (supabase
      ? createSupabaseMcpGrantStore(supabase)
      : createMemoryMcpGrantStore());
  const tasks =
    params.tasks ??
    (supabase
      ? createSupabaseMcpTaskStore(supabase)
      : createMemoryMcpTaskStore());
  const runtime: EngentyMcpRuntime = {
    approvalService: params.approvalService,
    auditLog: params.auditLog,
    authority: params.authority,
    config: params.config,
    dataDir: params.dataDir,
    grants,
    registry: params.registry,
    ...(params.resolveAgentApproval
      ? { resolveAgentApproval: params.resolveAgentApproval }
      : {}),
    resolvePath: params.resolvePath,
    tasks,
  };
  const fetchHandler = createCoreMcpFetchHandler(runtime);
  const resourceUrl = new URL(mcpResourceUrl(params.config));
  const supabaseUrl = envString(params.config, "supabaseUrl", "SUPABASE_URL");
  const issuer = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1`
    : resourceUrl.origin;

  params.app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
    c.json(
      buildMcpProtectedResourceMetadata({
        dangerouslyAllowInsecureIssuerUrl: resourceUrl.protocol === "http:",
        oauthMetadata: {
          issuer,
          authorization_endpoint: supabaseUrl
            ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/authorize`
            : `${resourceUrl.origin}/oauth/consent`,
          token_endpoint: supabaseUrl
            ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/token`
            : `${resourceUrl.origin}/oauth2/token`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
        },
        resourceName: "Engenty MCP",
        resourceServerUrl: resourceUrl,
        scopesSupported: [...DEFAULT_MCP_OAUTH_SCOPES],
      })
    )
  );

  params.app.all("/mcp", async (c) => {
    const request = c.req.raw;
    if (c.req.method === "POST") {
      const body = await request
        .clone()
        .json()
        .catch(() => null);
      const method =
        body && typeof body === "object" && "method" in body
          ? String((body as { method?: string }).method ?? "")
          : "";
      if (
        method === "tasks/get" ||
        method === "tasks/update" ||
        method === "tasks/cancel"
      ) {
        return handleTaskMethod(c, runtime, body as Record<string, unknown>);
      }
    }
    return fetchHandler(request);
  });

  params.app.post("/api/mcp/grants", async (c) => {
    const auth = await params.authProvider.resolvePrincipal(
      c.req.header("authorization")
    );
    if (!auth) {
      return jsonApiError(c, 401, { message: "Unauthorized" });
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      clientId?: string;
      maxRiskLevel?: string;
      spaceIds?: string[];
    };
    if (!body.clientId) {
      return jsonApiError(c, 400, { message: "clientId is required" });
    }
    const maxRiskLevel =
      body.maxRiskLevel === "low" ||
      body.maxRiskLevel === "medium" ||
      body.maxRiskLevel === "high" ||
      body.maxRiskLevel === "critical"
        ? body.maxRiskLevel
        : null;
    const spaceIds = [
      ...new Set(
        (Array.isArray(body.spaceIds) ? body.spaceIds : [])
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter(Boolean)
      ),
    ];
    if (!maxRiskLevel) {
      return jsonApiError(c, 400, { message: "maxRiskLevel is invalid" });
    }
    if (spaceIds.length === 0) {
      return jsonApiError(c, 400, { message: "Select at least one Space" });
    }
    const candidate: McpClientGrant = {
      clientId: body.clientId,
      maxRiskLevel,
      spaceIds,
      tenantId: auth.tenantId,
      userId: auth.principalId,
    };
    const accessible = await params.authority.listSpaces(candidate, auth);
    if (accessible.length !== spaceIds.length) {
      return jsonApiError(c, 403, {
        message: "One or more selected Spaces are not accessible",
      });
    }
    const grant = await grants.upsert(candidate);
    return jsonApiSuccess(c, grant);
  });

  return runtime;
}

async function handleTaskMethod(
  c: {
    json: (body: unknown, status?: number) => Response;
    req: {
      header: (name: string) => string | undefined;
      raw: Request;
    };
  },
  runtime: EngentyMcpRuntime,
  body: Record<string, unknown>
) {
  const { authenticateMcpRequest, McpAuthError, mcpAuthErrorResponse } =
    await import("./auth.js");
  try {
    const { principal } = await authenticateMcpRequest({
      authorizationHeader: c.req.header("authorization"),
      config: runtime.config,
      grants: runtime.grants,
    });
    const params = (body.params ?? {}) as Record<string, unknown>;
    const taskId = String(params.taskId ?? params.id ?? "");
    const task = await runtime.tasks?.get(taskId);
    if (
      !(
        task &&
        assertTaskOwner(task, {
          clientId: principal.clientId ?? "",
          tenantId: principal.tenantId,
          userId: principal.actingForUserId ?? principal.principalId,
        })
      )
    ) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: body.id ?? null,
          error: { code: -32_001, message: "Task not found" },
        },
        200
      );
    }
    const method = String(body.method);
    if (method === "tasks/cancel") {
      const cancelled = await runtime.tasks?.cancel(task.id);
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: cancelled,
      });
    }
    if (method === "tasks/update") {
      const updated = await runtime.tasks?.update(task.id, {
        status: "working",
      });
      return c.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: updated,
      });
    }
    return c.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result: task,
    });
  } catch (error) {
    if (error instanceof McpAuthError) {
      return mcpAuthErrorResponse(error);
    }
    throw error;
  }
}
