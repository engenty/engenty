import type { createApprovalService } from "@engenty/approvals-sdk";
import { envString } from "@engenty/environment/env";
import {
  createEngentyMcpHttpHandler,
  DEFAULT_MCP_OAUTH_SCOPES,
  ensureDefaultOperationResultTemplate,
} from "@engenty/mcp-server";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { SecurityAuditLogAdapter } from "../../security/audit-adapter.js";
import type { PrincipalContext } from "../../security/auth.js";
import type { PolicyDeps } from "../../security/policy.js";
import { mcpResourceUrl } from "./audience.js";
import {
  authenticateMcpRequest,
  McpAuthError,
  mcpAuthErrorResponse,
} from "./auth.js";
import type { McpAuthorityResolver } from "./authority.js";
import type { McpGrantStore } from "./grants.js";
import { registerMcpSurface } from "./register-surface.js";
import { createMemoryMcpTaskStore, type McpTaskStore } from "./tasks.js";

type ApprovalService = ReturnType<typeof createApprovalService>;

export interface EngentyMcpRuntime {
  approvalService: ApprovalService;
  auditLog: SecurityAuditLogAdapter;
  authority: McpAuthorityResolver;
  config: Record<string, unknown>;
  dataDir: string;
  grants: McpGrantStore;
  registry: PluginRegistry;
  resolveAgentApproval?: PolicyDeps["resolveAgentApproval"];
  resolvePath: (p: string) => string;
  tasks?: McpTaskStore;
}

export function createCoreMcpFetchHandler(runtime: EngentyMcpRuntime) {
  ensureDefaultOperationResultTemplate();
  const tasks = runtime.tasks ?? createMemoryMcpTaskStore();
  const resourceUrl = new URL(mcpResourceUrl(runtime.config));
  const supabaseUrl = envString(runtime.config, "supabaseUrl", "SUPABASE_URL");
  const allowedOrigins = (
    envString(runtime.config, "corsOrigin", "CORS_ORIGIN", "*") || "*"
  )
    .split(",")
    .map((entry) => {
      try {
        return new URL(entry.trim()).hostname;
      } catch {
        return entry.trim();
      }
    })
    .filter(Boolean);
  const issuer = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1`
    : resourceUrl.origin;

  return createEngentyMcpHttpHandler({
    allowedOriginHostnames:
      allowedOrigins.includes("*") || allowedOrigins.length === 0
        ? ["localhost", "127.0.0.1", "engenty.localhost"]
        : allowedOrigins,
    authMetadata: {
      dangerouslyAllowInsecureIssuerUrl: resourceUrl.protocol === "http:",
      oauthMetadata: {
        issuer,
        authorization_endpoint: supabaseUrl
          ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/authorize`
          : `${resourceUrl.origin}/oauth/consent`,
        token_endpoint: supabaseUrl
          ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/oauth/token`
          : `${resourceUrl.origin}/oauth2/token`,
        jwks_uri: supabaseUrl
          ? `${supabaseUrl.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`
          : `${resourceUrl.origin}/api/auth/.well-known/jwks.json`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      },
      resourceName: "Engenty MCP",
      resourceServerUrl: resourceUrl,
      scopesSupported: [...DEFAULT_MCP_OAUTH_SCOPES],
    },
    authenticate: async (request) => {
      try {
        const { principal } = await authenticateMcpRequest({
          authorizationHeader:
            request.headers.get("authorization") ?? undefined,
          config: runtime.config,
          grants: runtime.grants,
        });
        return {
          clientId: principal.clientId ?? principal.principalId,
          extra: { principal },
          expiresAt: principal.expiresAt,
          scopes: principal.scopes,
          token: request.headers.get("authorization")?.slice(7) ?? "",
        };
      } catch (error) {
        if (error instanceof McpAuthError) {
          return mcpAuthErrorResponse(error);
        }
        throw error;
      }
    },
    register: async (server, auth) => {
      const principal = auth.extra?.principal as PrincipalContext | undefined;
      if (!principal?.clientId) {
        return;
      }
      const grant = await runtime.grants.get({
        clientId: principal.clientId,
        tenantId: principal.tenantId,
        userId: principal.actingForUserId ?? principal.principalId,
      });
      if (!grant) {
        return;
      }
      await registerMcpSurface({
        grant,
        principal,
        runtime: { ...runtime, tasks },
        server,
      });
    },
  });
}
