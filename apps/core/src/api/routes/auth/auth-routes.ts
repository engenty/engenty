import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { capabilityCovers } from "@engenty/plugin-sdk";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { jwtVerify, SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import {
  getSecuritySecret,
  type PrincipalContext,
  verifyAccessToken,
} from "../../../security/auth.js";
import type { AuthStores } from "../../../security/auth-stores/index.js";
import { revokeTokenId } from "../../../security/token-revocation.js";
import { clampCapabilities } from "../../../security/user-capabilities.js";

interface RateWindow {
  count: number;
  windowStartedAt: number;
}

const authRateWindows = new Map<string, RateWindow>();

const AUTH_RATE_WINDOW_MS = 60_000;
const AUTH_RATE_LIMIT = 60;

function parseArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
}

export function toHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function randomToken(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

export function nowEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function ttlFromMinutes(minutes: number): number {
  return Math.max(60, Math.floor(minutes * 60));
}

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const current = authRateWindows.get(key);
  if (!current || now - current.windowStartedAt > AUTH_RATE_WINDOW_MS) {
    authRateWindows.set(key, { count: 1, windowStartedAt: now });
    return true;
  }
  if (current.count >= AUTH_RATE_LIMIT) {
    return false;
  }
  current.count += 1;
  authRateWindows.set(key, current);
  return true;
}

/** Access-token lifetime handed out by `POST /api/auth/service-token`. */
export const SERVICE_TOKEN_TTL_SECONDS = 900;

/**
 * Capability required to mint a DURABLE credential — a never-expiring service
 * credential or a 30–90 day API token. Held by tenant admins and superadmins;
 * deliberately not by `tenant.member`, and not in the default agent bundles.
 */
export const CREDENTIAL_MINT_CAPABILITY = "core.credentials.manage";

/**
 * The two mint routes below escalate LIFETIME, so authentication alone can
 * never be their gate (AUTH-02). Two rules, both required:
 *
 *   1. The caller holds `core.credentials.manage`. Clamping the new
 *      credential's capabilities to the caller's is not enough on its own —
 *      it preserves authority while extending it from 15 minutes to forever.
 *   2. The caller's own token is not itself derived. A 900-second service
 *      token or a 30-day API token may not beget a longer-lived one; that
 *      round trip is exactly what service identity exists to prevent. Only a
 *      human session (oauth) with the capability may mint.
 */
function denyCredentialMint(principal: PrincipalContext): {
  error: string;
  reason: string;
} | null {
  if (!capabilityCovers(principal.capabilities, CREDENTIAL_MINT_CAPABILITY)) {
    return {
      error: "Forbidden",
      reason: `missing capability: ${CREDENTIAL_MINT_CAPABILITY}`,
    };
  }
  if (
    principal.authMethod === "service_credential" ||
    principal.authMethod === "api_token" ||
    principal.tokenType === "api_token"
  ) {
    return {
      error: "Forbidden",
      reason:
        "a derived credential cannot mint a longer-lived one; sign in as a user with core.credentials.manage",
    };
  }
  return null;
}

/**
 * Prefix for the raw half of a service credential. Makes a leaked secret
 * greppable in logs and unmistakable for a JWT.
 */
const SERVICE_SECRET_PREFIX = "engsvc";

/** Compare two hex digests without leaking their difference through timing. */
function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export async function signPrincipalToken(params: {
  secret: string;
  principal: PrincipalContext;
  tokenType: "access" | "refresh" | "api_token";
  expiresInSeconds: number;
  tokenId?: string;
  sessionId?: string;
}): Promise<string> {
  const tokenId = params.tokenId ?? uuidv7();
  const sessionId = params.sessionId ?? params.principal.sessionId;
  const payload = {
    tenant_id: params.principal.tenantId,
    role: params.principal.principalType,
    token_type: params.tokenType,
    auth_method: params.principal.authMethod,
    scopes: params.principal.scopes,
    module_ids: params.principal.moduleIds,
    capabilities: params.principal.capabilities,
    role_profiles: params.principal.roleProfiles,
    roles: params.principal.roles,
    permissions: params.principal.permissions,
    sid: sessionId,
    acting_for_user_id: params.principal.actingForUserId,
    delegation_chain: params.principal.delegationChain,
  };
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.principal.principalId)
    .setIssuedAt()
    .setIssuer(params.principal.issuer ?? "engenty-core")
    .setAudience(
      params.principal.audience.length > 0
        ? params.principal.audience
        : "engenty"
    )
    .setJti(tokenId)
    .setExpirationTime(`${params.expiresInSeconds}s`)
    .sign(new TextEncoder().encode(params.secret));
}

async function requireAuth(
  c: {
    req: { header: (name: string) => string | undefined };
    json: (body: unknown, status?: number) => Response;
  },
  config: Record<string, unknown>
): Promise<{ error: Response | null; auth: PrincipalContext | null }> {
  const auth = await verifyAccessToken(
    c.req.header("authorization"),
    getSecuritySecret(config),
    { transport: "rest" }
  );
  if (!auth) {
    return { error: c.json({ error: "Unauthorized" }, 401), auth: null };
  }
  return { error: null, auth };
}

export function registerAuthRoutes(params: {
  app: OpenAPIHono;
  config: Record<string, unknown>;
  auditLog: SecurityAuditLogAdapter;
  stores: AuthStores;
}) {
  params.app.get("/api/auth/.well-known/openid-configuration", (c) => {
    const baseUrl = c.req.header("x-forwarded-host")
      ? `${c.req.header("x-forwarded-proto") ?? "https"}://${c.req.header("x-forwarded-host")}`
      : "http://127.0.0.1:8787";
    return c.json({
      issuer: "engenty-core",
      jwks_uri: `${baseUrl}/api/auth/.well-known/jwks.json`,
      device_authorization_endpoint: `${baseUrl}/api/auth/device/authorize`,
      token_endpoint: `${baseUrl}/api/auth/device/token`,
      revocation_endpoint: `${baseUrl}/api/auth/token/revoke`,
      introspection_endpoint: `${baseUrl}/api/auth/token/introspect`,
      grant_types_supported: [
        "urn:ietf:params:oauth:grant-type:device_code",
        "refresh_token",
        "client_credentials",
      ],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    });
  });

  params.app.get("/api/auth/.well-known/jwks.json", (c) =>
    c.json({ keys: [] })
  );

  params.app.post("/api/auth/token/exchange", async (c) => {
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`token-exchange:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.rate_limited",
        detail: { route: "token/exchange", sourceIp },
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      refreshToken?: string;
    };
    const refreshToken = String(body.refreshToken ?? "");
    if (!refreshToken) {
      return c.json({ error: "refreshToken is required" }, 400);
    }
    try {
      const verified = await jwtVerify(
        refreshToken,
        new TextEncoder().encode(secret)
      );
      const payload = verified.payload as Record<string, unknown>;
      if (payload.token_type !== "refresh") {
        return c.json({ error: "invalid_grant" }, 400);
      }
      const sessionId = typeof payload.sid === "string" ? payload.sid : "";
      const tokenId = typeof payload.jti === "string" ? payload.jti : "";
      const principal = await verifyAccessToken(
        `Bearer ${refreshToken}`,
        secret,
        { transport: "rest" }
      );
      if (!(principal && sessionId && tokenId)) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      const session = await params.stores.sessions.get(sessionId);
      if (!session || session.revokedAt) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      if (session.refreshTokenId !== tokenId) {
        return c.json({ error: "invalid_grant" }, 400);
      }
      if (session.refreshTokenHash !== toHash(refreshToken)) {
        return c.json({ error: "invalid_grant" }, 400);
      }

      const nextRefreshTokenId = uuidv7();
      const nextRefreshToken = await signPrincipalToken({
        secret,
        principal,
        tokenType: "refresh",
        expiresInSeconds: ttlFromMinutes(60 * 24 * 14),
        tokenId: nextRefreshTokenId,
        sessionId,
      });
      const accessToken = await signPrincipalToken({
        secret,
        principal,
        tokenType: "access",
        expiresInSeconds: ttlFromMinutes(15),
        sessionId,
      });
      await params.stores.sessions.update(sessionId, {
        expiresAt: nowEpochSeconds() + ttlFromMinutes(60 * 24 * 14),
        refreshTokenHash: toHash(nextRefreshToken),
        refreshTokenId: nextRefreshTokenId,
      });
      revokeTokenId(
        tokenId,
        typeof payload.exp === "number" ? payload.exp : undefined
      );
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.token_exchanged",
        actorId: principal.principalId,
        tenantId: principal.tenantId,
        detail: { sessionId },
      });
      return c.json({
        tokenType: "Bearer",
        accessToken,
        refreshToken: nextRefreshToken,
        expiresIn: ttlFromMinutes(15),
        sessionId,
      });
    } catch {
      return c.json({ error: "invalid_grant" }, 400);
    }
  });

  params.app.post("/api/auth/token/revoke", async (c) => {
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`token-revoke:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.rate_limited",
        detail: { route: "token/revoke", sourceIp },
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      token?: string;
      sessionId?: string;
      tokenId?: string;
    };
    const token = typeof body.token === "string" ? body.token : undefined;
    const sessionId =
      typeof body.sessionId === "string" ? body.sessionId : undefined;
    const explicitTokenId =
      typeof body.tokenId === "string" ? body.tokenId : undefined;
    let revokedTokenId: string | undefined;
    let revokedTenantId: string | undefined;
    let revokedActorId: string | undefined;
    if (token) {
      try {
        const verified = await jwtVerify(
          token,
          new TextEncoder().encode(secret)
        );
        const payload = verified.payload as Record<string, unknown>;
        revokedTokenId =
          typeof payload.jti === "string" ? payload.jti : undefined;
        revokedTenantId =
          typeof payload.tenant_id === "string" ? payload.tenant_id : undefined;
        revokedActorId =
          typeof payload.sub === "string" ? payload.sub : undefined;
        revokeTokenId(
          revokedTokenId ?? "",
          typeof payload.exp === "number" ? payload.exp : undefined
        );
        const sid = typeof payload.sid === "string" ? payload.sid : undefined;
        if (sid && (await params.stores.sessions.get(sid))) {
          await params.stores.sessions.update(sid, {
            revokedAt: nowEpochSeconds(),
          });
        }
      } catch {
        return c.json({ error: "invalid_token" }, 400);
      }
    }
    const sessionToRevoke = sessionId
      ? await params.stores.sessions.get(sessionId)
      : null;
    if (sessionId && sessionToRevoke) {
      await params.stores.sessions.update(sessionId, {
        revokedAt: nowEpochSeconds(),
      });
      revokeTokenId(sessionToRevoke.refreshTokenId);
    }
    if (explicitTokenId) {
      revokeTokenId(explicitTokenId);
      await params.stores.apiTokens.revoke(explicitTokenId);
    }
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.token_revoked",
      actorId: revokedActorId,
      tenantId: revokedTenantId,
      detail: { tokenId: revokedTokenId ?? explicitTokenId, sessionId },
    });
    return c.json({ ok: true });
  });

  params.app.post("/api/auth/token/introspect", async (c) => {
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ active: false });
    }
    const body = (await c.req.json().catch(() => ({}))) as { token?: string };
    const token = String(body.token ?? "");
    if (!token) {
      return c.json({ active: false });
    }
    const principal = await verifyAccessToken(`Bearer ${token}`, secret, {
      transport: "rest",
    });
    if (!principal) {
      return c.json({ active: false });
    }
    return c.json({
      active: true,
      sub: principal.principalId,
      tenantId: principal.tenantId,
      principalType: principal.principalType,
      tokenType: principal.tokenType,
      scope: principal.scopes.join(" "),
      capabilities: principal.capabilities,
      exp: principal.expiresAt,
      iat: principal.issuedAt,
      jti: principal.tokenId,
      sid: principal.sessionId,
    });
  });

  // ---------------------------------------------------------------------
  // Service credentials (PLAN-service-identity.md, CP2).
  //
  // The exchange route below is the ONLY unauthenticated write in this file,
  // by design: the credential *is* the authentication. It differs from
  // /api/auth/api-tokens in the one way that matters — what it hands back is
  // a 15-minute access token, not a 30-day bearer. The durable half never
  // travels as an Authorization header and can be revoked without waiting for
  // an expiry.
  // ---------------------------------------------------------------------

  params.app.post("/api/auth/service-token", async (c) => {
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    const body = (await c.req.json().catch(() => ({}))) as {
      credentialId?: string;
      secret?: string;
    };
    const credentialId = String(body.credentialId ?? "").trim();
    const secret = String(body.secret ?? "");
    if (!(credentialId && secret)) {
      return c.json({ error: "credentialId and secret are required" }, 400);
    }
    if (!checkRateLimit(`service-token:${credentialId}:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.rate_limited",
        detail: { credentialId, route: "service-token", sourceIp },
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }
    const signingSecret = getSecuritySecret(params.config);
    if (!signingSecret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }

    const credential = await params.stores.serviceCredentials.get(credentialId);
    // Unknown, disabled and wrong-secret all answer identically. A caller
    // holding a bad secret learns only "no".
    const rejected =
      !credential ||
      credential.disabledAt !== undefined ||
      !hashesMatch(toHash(secret), credential.secretHash);
    if (rejected) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.service_token_rejected",
        tenantId: credential?.tenantId,
        detail: {
          credentialId,
          reason: credential
            ? credential.disabledAt
              ? "disabled"
              : "bad_secret"
            : "unknown",
          sourceIp,
        },
      });
      return c.json({ error: "invalid_client" }, 401);
    }

    const tokenId = uuidv7();
    const principal: PrincipalContext = {
      audience: ["engenty"],
      authMethod: "service_credential",
      capabilities: credential.capabilities,
      delegationChain: [],
      moduleIds: [],
      permissions: [],
      principalId: credential.id,
      principalType: "service",
      roleProfiles: [],
      roles: [],
      scopes: [],
      tenantId: credential.tenantId,
      tokenType: "access",
    };
    const token = await signPrincipalToken({
      expiresInSeconds: SERVICE_TOKEN_TTL_SECONDS,
      principal,
      secret: signingSecret,
      tokenId,
      tokenType: "access",
    });
    // Never let telemetry bookkeeping fail the mint the caller is waiting on.
    await params.stores.serviceCredentials
      .touch(credential.id, nowEpochSeconds())
      .catch(() => undefined);
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.service_token_minted",
      actorId: credential.id,
      tenantId: credential.tenantId,
      detail: {
        capabilities: credential.capabilities,
        credentialName: credential.name,
        tokenId,
        ttlSeconds: SERVICE_TOKEN_TTL_SECONDS,
      },
    });
    return c.json({
      expiresAt: new Date(
        (nowEpochSeconds() + SERVICE_TOKEN_TTL_SECONDS) * 1000
      ).toISOString(),
      expiresIn: SERVICE_TOKEN_TTL_SECONDS,
      token,
      tokenType: "Bearer",
    });
  });

  params.app.post("/api/auth/service-credentials", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const principal = authResult.auth;
    const denied = denyCredentialMint(principal);
    if (denied) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.credential_mint_denied",
        actorId: principal.principalId,
        tenantId: principal.tenantId,
        detail: { reason: denied.reason, route: "service-credentials" },
      });
      return c.json(denied, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return c.json({ error: "name is required" }, 400);
    }
    // Same clamp as api-tokens: a credential can never outrank its creator.
    const capabilities = clampCapabilities(
      parseArray(body.capabilities),
      principal.capabilities
    );
    const id = uuidv7();
    const rawSecret = randomToken(SERVICE_SECRET_PREFIX);
    await params.stores.serviceCredentials.insert({
      capabilities,
      createdAt: nowEpochSeconds(),
      id,
      name,
      secretHash: toHash(rawSecret),
      tenantId: principal.tenantId,
    });
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.service_credential_created",
      actorId: principal.principalId,
      tenantId: principal.tenantId,
      detail: { capabilities, credentialId: id, name },
    });
    return c.json({
      capabilities,
      credentialId: id,
      name,
      // The one and only time the raw secret exists outside the caller.
      // `<credentialId>.<rawSecret>` is the ENGENTY_AI_SERVICE_SECRET format.
      secret: `${id}.${rawSecret}`,
    });
  });

  params.app.get("/api/auth/service-credentials", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const credentials = (
      await params.stores.serviceCredentials.listForTenant(
        authResult.auth.tenantId
      )
    ).map((credential) => ({
      capabilities: credential.capabilities,
      createdAt: new Date(credential.createdAt * 1000).toISOString(),
      credentialId: credential.id,
      disabled: credential.disabledAt !== undefined,
      lastUsedAt: credential.lastUsedAt
        ? new Date(credential.lastUsedAt * 1000).toISOString()
        : null,
      name: credential.name,
    }));
    return c.json({ credentials });
  });

  params.app.delete(
    "/api/auth/service-credentials/:credentialId",
    async (c) => {
      const authResult = await requireAuth(c, params.config);
      if (authResult.error || !authResult.auth) {
        return authResult.error!;
      }
      const credentialId = c.req.param("credentialId");
      const record = await params.stores.serviceCredentials.get(credentialId);
      // Cross-tenant reads answer 404, not 403 — don't confirm existence.
      if (!record || record.tenantId !== authResult.auth.tenantId) {
        return c.json({ error: "Credential not found" }, 404);
      }
      await params.stores.serviceCredentials.revoke(credentialId);
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.service_credential_revoked",
        actorId: authResult.auth.principalId,
        tenantId: authResult.auth.tenantId,
        detail: { credentialId, name: record.name },
      });
      return c.json({ ok: true });
    }
  );

  params.app.post("/api/auth/api-tokens", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const mintDenied = denyCredentialMint(authResult.auth);
    if (mintDenied) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.credential_mint_denied",
        actorId: authResult.auth.principalId,
        tenantId: authResult.auth.tenantId,
        detail: { reason: mintDenied.reason, route: "api-tokens" },
      });
      return c.json(mintDenied, 403);
    }
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }
    const body = (await c.req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const expiresInDays = Number(body.expiresInDays ?? 30);
    const tokenId = uuidv7();
    const principal = authResult.auth;
    // Clamp every requested scope to what the creator actually holds —
    // an API token can never be more powerful than its creator.
    const requestedCapabilities = parseArray(body.capabilities);
    const capabilities = clampCapabilities(
      requestedCapabilities,
      principal.capabilities
    );
    const moduleIds =
      parseArray(body.moduleIds).length > 0 && principal.moduleIds.length > 0
        ? parseArray(body.moduleIds).filter((id) =>
            principal.moduleIds.includes(id)
          )
        : parseArray(body.moduleIds).length > 0
          ? parseArray(body.moduleIds)
          : principal.moduleIds;
    const scopes =
      parseArray(body.scopes).length > 0
        ? parseArray(body.scopes).filter(
            (scope) =>
              principal.scopes.length === 0 || principal.scopes.includes(scope)
          )
        : principal.scopes;
    const principalType =
      body.principalType === "service" ? "service" : "agent";
    const tokenPrincipal: PrincipalContext = {
      ...principal,
      authMethod: "api_token",
      tokenType: "api_token",
      principalType,
      capabilities,
      moduleIds,
      scopes,
      roles: [],
      permissions: [],
    };
    const expiresInSeconds = Math.max(
      3600,
      Math.floor(expiresInDays * 24 * 60 * 60)
    );
    const rawToken = await signPrincipalToken({
      secret,
      principal: tokenPrincipal,
      tokenType: "api_token",
      expiresInSeconds,
      tokenId,
      sessionId: principal.sessionId,
    });
    await params.stores.apiTokens.insert({
      capabilities,
      createdAt: nowEpochSeconds(),
      expiresAt: nowEpochSeconds() + expiresInSeconds,
      id: tokenId,
      last4: rawToken.slice(-4),
      moduleIds,
      name: String(body.name ?? "default"),
      principalId: principal.principalId,
      principalType,
      scopes,
      tenantId: principal.tenantId,
      tokenHash: toHash(rawToken),
    });
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.api_token_created",
      actorId: principal.principalId,
      tenantId: principal.tenantId,
      detail: { tokenId, capabilities, principalType },
    });
    return c.json({
      tokenId,
      token: rawToken,
      capabilities,
      expiresAt: new Date(
        (nowEpochSeconds() + expiresInSeconds) * 1000
      ).toISOString(),
    });
  });

  params.app.get("/api/auth/api-tokens", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const principal = authResult.auth;
    const tokens = (
      await params.stores.apiTokens.listForPrincipal(
        principal.tenantId,
        principal.principalId
      )
    ).map((token) => ({
      tokenId: token.id,
      name: token.name,
      last4: token.last4,
      principalType: token.principalType,
      createdAt: new Date(token.createdAt * 1000).toISOString(),
      expiresAt: new Date(token.expiresAt * 1000).toISOString(),
      revoked: Boolean(token.revokedAt),
      capabilities: token.capabilities,
      moduleIds: token.moduleIds,
      scopes: token.scopes,
    }));
    return c.json({ tokens });
  });

  params.app.delete("/api/auth/api-tokens/:tokenId", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const tokenId = c.req.param("tokenId");
    const record = await params.stores.apiTokens.get(tokenId);
    if (!record) {
      return c.json({ error: "Token not found" }, 404);
    }
    if (
      record.principalId !== authResult.auth.principalId ||
      record.tenantId !== authResult.auth.tenantId
    ) {
      return c.json({ error: "Token not found" }, 404);
    }
    await params.stores.apiTokens.revoke(tokenId);
    revokeTokenId(tokenId, record.expiresAt);
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.token_revoked",
      actorId: authResult.auth.principalId,
      tenantId: authResult.auth.tenantId,
      detail: { tokenId },
    });
    return c.json({ ok: true });
  });

  params.app.get("/api/auth/sessions", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const principal = authResult.auth;
    const rows = (
      await params.stores.sessions.listForPrincipal(
        principal.tenantId,
        principal.principalId
      )
    ).map((session) => ({
      id: session.id,
      createdAt: new Date(session.createdAt * 1000).toISOString(),
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
      revokedAt: session.revokedAt
        ? new Date(session.revokedAt * 1000).toISOString()
        : null,
    }));
    return c.json({ sessions: rows });
  });

  params.app.delete("/api/auth/sessions/:sessionId", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if (authResult.error || !authResult.auth) {
      return authResult.error!;
    }
    const session = await params.stores.sessions.get(c.req.param("sessionId"));
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    if (session.principalId !== authResult.auth.principalId) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await params.stores.sessions.update(session.id, {
      revokedAt: nowEpochSeconds(),
    });
    revokeTokenId(session.refreshTokenId, session.expiresAt);
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.session_revoked",
      actorId: authResult.auth.principalId,
      tenantId: authResult.auth.tenantId,
      detail: { sessionId: session.id },
    });
    return c.json({ ok: true });
  });
}
