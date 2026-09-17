import { envString } from "@engenty/environment/env";
import {
  DEFAULT_MCP_AUDIENCE,
  wwwAuthenticateChallenge,
} from "@engenty/mcp-server";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  type JWTPayload,
  jwtVerify,
} from "jose";
import type { PrincipalContext } from "../../security/auth.js";
import { getSecuritySecret } from "../../security/auth.js";
import { isTokenIdRevoked } from "../../security/token-revocation.js";
import {
  isMcpAudienceAllowed,
  mcpAudience,
  mcpPrincipalId,
  mcpResourceUrl,
} from "./audience.js";
import type { McpClientGrant, McpGrantStore } from "./grants.js";

export class McpAuthError extends Error {
  readonly status: 401 | 403;
  readonly wwwAuthenticate: string;

  constructor(status: 401 | 403, message: string, wwwAuthenticate: string) {
    super(message);
    this.name = "McpAuthError";
    this.status = status;
    this.wwwAuthenticate = wwwAuthenticate;
  }
}

function parseArrayClaim(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
}

function challenge(config: Record<string, unknown>, error: string): string {
  return wwwAuthenticateChallenge({
    error,
    resourceMetadataUrl: `${mcpResourceUrl(config).replace(/\/mcp$/, "")}/.well-known/oauth-protected-resource/mcp`,
  });
}

async function verifyJwt(
  token: string,
  config: Record<string, unknown>
): Promise<JWTPayload> {
  const header = decodeProtectedHeader(token);
  const secret = getSecuritySecret(config);
  if (header.alg === "HS256") {
    if (!secret) {
      throw new Error("missing_secret");
    }
    const verified = await jwtVerify(token, new TextEncoder().encode(secret));
    return verified.payload;
  }
  const supabaseUrl = envString(config, "supabaseUrl", "SUPABASE_URL").replace(
    /\/$/,
    ""
  );
  if (!supabaseUrl) {
    throw new Error("missing_jwks");
  }
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(
    new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  );
  const verified = await jwtVerify(token, jwks, { issuer });
  return verified.payload;
}

export async function authenticateMcpRequest(params: {
  authorizationHeader: string | undefined;
  config: Record<string, unknown>;
  grants: McpGrantStore;
  spaceId?: string;
}): Promise<{ grant: McpClientGrant; principal: PrincipalContext }> {
  const header = params.authorizationHeader;
  if (!header?.toLowerCase().startsWith("bearer ")) {
    throw new McpAuthError(
      401,
      "missing_token",
      challenge(params.config, "invalid_token")
    );
  }
  const token = header.slice("Bearer ".length).trim();
  let payload: JWTPayload;
  try {
    payload = await verifyJwt(token, params.config);
  } catch {
    throw new McpAuthError(
      401,
      "invalid_token",
      challenge(params.config, "invalid_token")
    );
  }
  const record = payload as Record<string, unknown>;
  const audiences = parseArrayClaim(record.aud);
  const allowedAudience = mcpAudience(params.config);
  if (!isMcpAudienceAllowed(audiences, allowedAudience)) {
    throw new McpAuthError(
      401,
      "invalid_audience",
      challenge(params.config, "invalid_token")
    );
  }
  const tenantId = typeof record.tenant_id === "string" ? record.tenant_id : "";
  const actingForUserId =
    typeof record.acting_for_user_id === "string"
      ? record.acting_for_user_id
      : typeof record.sub === "string"
        ? record.sub
        : "";
  const clientId =
    typeof record.client_id === "string"
      ? record.client_id
      : typeof record.azp === "string"
        ? record.azp
        : "";
  const tokenId = typeof record.jti === "string" ? record.jti : undefined;
  if (isTokenIdRevoked(tokenId)) {
    throw new McpAuthError(
      401,
      "revoked_token",
      challenge(params.config, "invalid_token")
    );
  }
  if (!(tenantId && actingForUserId && clientId)) {
    throw new McpAuthError(
      401,
      "invalid_token",
      challenge(params.config, "invalid_token")
    );
  }
  const grant = await params.grants.get({
    clientId,
    tenantId,
    userId: actingForUserId,
  });
  if (!grant) {
    throw new McpAuthError(
      403,
      "no_grant",
      challenge(params.config, "insufficient_scope")
    );
  }
  const principalId = mcpPrincipalId(clientId);
  const principal: PrincipalContext = {
    actingForUserId,
    agentId: principalId,
    audience: audiences.length > 0 ? audiences : [DEFAULT_MCP_AUDIENCE],
    authMethod: "oauth",
    capabilities: [],
    clientId,
    delegationChain: [],
    expiresAt: typeof record.exp === "number" ? record.exp : undefined,
    issuedAt: typeof record.iat === "number" ? record.iat : undefined,
    issuer: typeof record.iss === "string" ? record.iss : undefined,
    maxRiskLevel: grant.maxRiskLevel,
    moduleIds: [],
    permissions: [],
    principalId,
    principalType: "agent",
    roleProfiles: ["agent.assistant"],
    roles: ["agent"],
    scopes: parseArrayClaim(record.scopes),
    spaceId:
      params.spaceId ??
      (grant.spaceIds.length === 1 ? grant.spaceIds[0] : undefined),
    tenantId,
    tokenId,
    tokenType: "access",
    transport: "mcp",
  };
  return { grant, principal };
}

export function mcpAuthErrorResponse(error: McpAuthError): Response {
  return new Response(JSON.stringify({ error: error.message }), {
    headers: {
      "content-type": "application/json",
      "www-authenticate": error.wwwAuthenticate,
    },
    status: error.status,
  });
}
