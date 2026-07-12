import { envString } from "@engenty/environment/env";
import { jwtVerify } from "jose";
import { isTokenIdRevoked } from "./token-revocation.js";

export type PrincipalType = "user" | "agent" | "service";

export type AuthMethod =
  | "oauth"
  | "api_token"
  | "service_credential"
  | "unknown";

export interface PrincipalContext {
  actingForUserId?: string;
  /**
   * Agent driving this request (Phase 4). Set when an agent acts — either an
   * agent token (== principalId) or an agent acting for a user in chat
   * (forwarded user token + x-engenty-agent-id). Enables goal-scoped escalation.
   */
  agentId?: string;
  audience: string[];
  authMethod: AuthMethod;
  capabilities: string[];
  clientId?: string;
  delegationChain: string[];
  expiresAt?: number;
  /** Goal/objective the agent run is executing; scope for approval grants. */
  goalId?: string;
  issuedAt?: number;
  issuer?: string;
  moduleIds: string[];
  permissions: string[];
  principalId: string;
  principalType: PrincipalType;
  roleProfiles: string[];
  roles: string[];
  scopes: string[];
  sessionId?: string;
  tenantId: string;
  tokenId?: string;
  tokenType: "access" | "refresh" | "api_token" | "unknown";
  transport?: "rest" | "cli" | "mcp" | "http" | "gateway" | "module_ops";
}

function parseArrayClaim(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
}

function defaultCapabilities(
  role: PrincipalContext["principalType"]
): string[] {
  if (role === "service") {
    return ["module.read", "module.write", "module.execute"];
  }
  if (role === "agent") {
    return ["module.read", "module.write"];
  }
  return ["module.read"];
}

function parsePrincipalType(payload: Record<string, unknown>): PrincipalType {
  if (
    payload.role === "user" ||
    payload.role === "agent" ||
    payload.role === "service"
  ) {
    return payload.role;
  }
  return "service";
}

function parseTokenType(
  payload: Record<string, unknown>
): PrincipalContext["tokenType"] {
  if (
    payload.token_type === "access" ||
    payload.token_type === "refresh" ||
    payload.token_type === "api_token"
  ) {
    return payload.token_type;
  }
  return "access";
}

function parseAuthMethod(payload: Record<string, unknown>): AuthMethod {
  if (
    payload.auth_method === "oauth" ||
    payload.auth_method === "api_token" ||
    payload.auth_method === "service_credential"
  ) {
    return payload.auth_method;
  }
  if (payload.token_type === "api_token") {
    return "api_token";
  }
  return "oauth";
}

function normalizeAudience(aud: unknown): string[] {
  if (typeof aud === "string" && aud.length > 0) {
    return [aud];
  }
  return parseArrayClaim(aud);
}

export function getSecuritySecret(config: Record<string, unknown>): string {
  return envString(config, "securityJwtSecret", "ENGENTY_SECURITY_JWT_SECRET");
}

export async function verifyAccessToken(
  authHeader: string | undefined,
  secret: string | undefined,
  options?: {
    transport?: PrincipalContext["transport"];
  }
): Promise<PrincipalContext | null> {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  if (!secret) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return null;
  }

  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret));
    const payload = verified.payload as Record<string, unknown>;
    const tenantId =
      typeof payload.tenant_id === "string" ? payload.tenant_id : "";
    const principalId = typeof payload.sub === "string" ? payload.sub : "";
    const principalType = parsePrincipalType(payload);
    if (!(tenantId && principalId)) {
      return null;
    }
    const capabilities = parseArrayClaim(payload.capabilities);
    const roleProfiles = parseArrayClaim(payload.role_profiles).concat(
      parseArrayClaim(payload.profiles)
    );
    const tokenId = typeof payload.jti === "string" ? payload.jti : undefined;
    if (isTokenIdRevoked(tokenId)) {
      return null;
    }
    return {
      principalId,
      principalType,
      tenantId,
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
      authMethod: parseAuthMethod(payload),
      tokenType: parseTokenType(payload),
      roles: parseArrayClaim(payload.roles),
      permissions: parseArrayClaim(payload.permissions),
      actingForUserId:
        typeof payload.acting_for_user_id === "string"
          ? payload.acting_for_user_id
          : undefined,
      delegationChain: parseArrayClaim(payload.delegation_chain),
      scopes: parseArrayClaim(payload.scopes),
      moduleIds: parseArrayClaim(payload.module_ids),
      capabilities:
        capabilities.length > 0
          ? capabilities
          : defaultCapabilities(principalType),
      roleProfiles: Array.from(new Set(roleProfiles)),
      issuer: typeof payload.iss === "string" ? payload.iss : undefined,
      audience: normalizeAudience(payload.aud),
      clientId:
        typeof payload.client_id === "string" ? payload.client_id : undefined,
      tokenId,
      issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      transport: options?.transport,
    };
  } catch {
    return null;
  }
}
