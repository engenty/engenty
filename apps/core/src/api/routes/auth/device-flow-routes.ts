import { createHash, randomBytes } from "node:crypto";
import type { OpenAPIHono } from "@hono/zod-openapi";
import { uuidv7 } from "uuidv7";
import type { SecurityAuditLogAdapter } from "../../../security/audit-adapter.js";
import { recordCoreAuditEvent } from "../../../security/audit-service.js";
import {
  getSecuritySecret,
  type PrincipalContext,
} from "../../../security/auth.js";
import type { AuthStores } from "../../../security/auth-stores/index.js";
import {
  capabilitiesForUser,
  clampCapabilities,
} from "../../../security/user-capabilities.js";
import { requireAuth } from "../authz.js";
import {
  checkRateLimit,
  nowEpochSeconds,
  signPrincipalToken,
  toHash,
  ttlFromMinutes,
} from "./auth-routes.js";

/** Unambiguous alphabet (no 0/O/1/I) for human-typed codes. */
const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const POLL_INTERVAL_SECONDS = 5;
const MAX_TTL_MINUTES = 15;

export function generateUserCode(): string {
  const bytes = randomBytes(8);
  const chars = [...bytes].map(
    (byte) => USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]
  );
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export function normalizeUserCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length === 8
    ? `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`
    : raw.toUpperCase().trim();
}

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Accept JSON (our CLI) and form-encoded (RFC OAuth clients) request bodies. */
async function parseRequestBody(c: {
  req: {
    header: (name: string) => string | undefined;
    json: () => Promise<unknown>;
    parseBody: () => Promise<Record<string, unknown>>;
  };
}): Promise<Record<string, unknown>> {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return await c.req.parseBody().catch(() => ({}));
  }
  return ((await c.req.json().catch(() => ({}))) ?? {}) as Record<
    string,
    unknown
  >;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
}

/** Resolve the approver's role in ONE tenant (superadmins approve any tenant). */
export type ApproverRoleResolver = (input: {
  tenantId: string;
  userId: string;
}) => Promise<{ isMember: boolean; tenantRole: "admin" | "member" | null }>;

export interface DeviceFlowRoutesParams {
  app: OpenAPIHono;
  auditLog: SecurityAuditLogAdapter;
  config: Record<string, unknown>;
  resolveApproverRole: ApproverRoleResolver;
  stores: AuthStores;
}

export function registerDeviceFlowRoutes(params: DeviceFlowRoutesParams) {
  registerAuthorizeRoute(params);
  registerApproveRoute(params);
  registerTokenRoute(params);
}

function registerAuthorizeRoute(params: DeviceFlowRoutesParams) {
  const handler = async (c: any) => {
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`device-authorize:${sourceIp}`)) {
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.rate_limited",
        detail: { route: "device/authorize", sourceIp },
      });
      return c.json({ error: "Too Many Requests" }, 429);
    }
    const body = await parseRequestBody(c);
    // Identity comes from the APPROVER — the request only carries a wish list.
    const requested = {
      capabilities: parseStringArray(body.capabilities),
      moduleIds: parseStringArray(body.moduleIds),
      scopes: parseStringArray(body.scopes),
    };
    const ttlMinutes = Math.min(
      Number(body.expiresInMinutes) > 0 ? Number(body.expiresInMinutes) : 10,
      MAX_TTL_MINUTES
    );
    const deviceCode = `eng_device_${randomBytes(24).toString("hex")}`;
    let userCode = generateUserCode();
    if (await params.stores.devices.getPendingByUserCode(userCode)) {
      userCode = generateUserCode();
    }
    await params.stores.devices.insert({
      clientName:
        typeof body.clientName === "string"
          ? body.clientName.slice(0, 120)
          : undefined,
      createdAt: nowEpochSeconds(),
      deviceCodeHash: sha256(deviceCode),
      expiresAt: nowEpochSeconds() + ttlMinutes * 60,
      requested,
      status: "pending",
      userCode,
    });
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.login_started",
      detail: { method: "device_code", userCode },
    });
    const origin = String(
      params.config.publicAppUrl ??
        process.env.PUBLIC_APP_URL ??
        process.env.ENGENTY_UI_BASE_URL ??
        ""
    ).replace(/\/$/, "");
    const verificationUri = `${origin}/auth/device`;
    const verificationUriComplete = `${verificationUri}?user_code=${encodeURIComponent(userCode)}`;
    return c.json({
      // camelCase: engenty CLI; snake_case: RFC 8628 clients (auth.md protocol)
      deviceCode,
      device_code: deviceCode,
      expiresIn: ttlMinutes * 60,
      expires_in: ttlMinutes * 60,
      interval: POLL_INTERVAL_SECONDS,
      userCode,
      user_code: userCode,
      verificationUri,
      verification_uri: verificationUri,
      verificationUriComplete,
      verification_uri_complete: verificationUriComplete,
    });
  };
  params.app.post("/api/auth/device/authorize", handler);
  params.app.post("/oauth2/device_authorization", handler);
}

function registerApproveRoute(params: DeviceFlowRoutesParams) {
  params.app.post("/api/auth/device/approve", async (c) => {
    const authResult = await requireAuth(c, params.config);
    if ("error" in authResult) {
      return authResult.error;
    }
    const approver = authResult.auth;
    if (approver.principalType !== "user" || !approver.userId) {
      return c.json({ error: "Only users can approve device logins" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      action?: string;
      tenantId?: string;
      userCode?: string;
    };
    const userCode = normalizeUserCode(String(body.userCode ?? ""));
    const tenantId = String(body.tenantId ?? "");
    const action = body.action === "deny" ? "deny" : "approve";

    const record = await params.stores.devices.getPendingByUserCode(userCode);
    if (!record) {
      return c.json({ error: "code_not_found_or_expired" }, 404);
    }

    if (action === "deny") {
      await params.stores.devices.update(record.deviceCodeHash, {
        approvedAt: nowEpochSeconds(),
        approvedBy: approver.userId,
        status: "denied",
      });
      recordCoreAuditEvent(params.auditLog, {
        type: "auth.device_denied",
        actorId: approver.userId,
        detail: { userCode },
      });
      return c.json({ ok: true, status: "denied" });
    }

    if (!tenantId) {
      return c.json({ error: "tenantId is required" }, 400);
    }
    const role = await params.resolveApproverRole({
      tenantId,
      userId: approver.userId,
    });
    if (!(role.isMember || approver.isSuperAdmin)) {
      return c.json({ error: "not_a_member_of_tenant" }, 403);
    }
    const grantedCapabilities = clampCapabilities(
      record.requested.capabilities,
      capabilitiesForUser({
        isSuperAdmin: approver.isSuperAdmin,
        tenantRole: role.tenantRole,
      })
    );
    const granted = {
      capabilities: grantedCapabilities,
      moduleIds: record.requested.moduleIds,
      scopes: record.requested.scopes,
    };
    await params.stores.devices.update(record.deviceCodeHash, {
      approvedAt: nowEpochSeconds(),
      approvedBy: approver.userId,
      approvedTenantId: tenantId,
      granted,
      status: "approved",
    });
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.device_approved",
      actorId: approver.userId,
      tenantId,
      detail: { granted: grantedCapabilities, userCode },
    });
    return c.json({ granted, ok: true, status: "approved" });
  });
}

function registerTokenRoute(params: DeviceFlowRoutesParams) {
  const handler = async (c: any) => {
    const sourceIp = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`device-token:${sourceIp}`)) {
      return c.json({ error: "slow_down" }, 429);
    }
    const secret = getSecuritySecret(params.config);
    if (!secret) {
      return c.json({ error: "Auth secret not configured" }, 500);
    }
    const body = await parseRequestBody(c);
    const codeHash = sha256(String(body.deviceCode ?? body.device_code ?? ""));
    const record = await params.stores.devices.getByCodeHash(codeHash);
    if (!record) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (record.expiresAt < nowEpochSeconds()) {
      await params.stores.devices.update(codeHash, { status: "expired" });
      return c.json({ error: "expired_token" }, 400);
    }
    if (record.status === "denied") {
      return c.json({ error: "access_denied" }, 400);
    }
    if (record.status === "consumed" || record.status === "expired") {
      return c.json({ error: "invalid_grant" }, 400);
    }
    if (record.status === "pending") {
      const last = record.lastPolledAt ?? 0;
      await params.stores.devices.update(codeHash, {
        lastPolledAt: nowEpochSeconds(),
      });
      if (nowEpochSeconds() - last < POLL_INTERVAL_SECONDS) {
        return c.json({ error: "slow_down" }, 400);
      }
      return c.json({ error: "authorization_pending" }, 400);
    }

    // approved → issue tokens exactly once
    if (!(record.approvedBy && record.approvedTenantId && record.granted)) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    await params.stores.devices.update(codeHash, { status: "consumed" });
    const sessionId = uuidv7();
    const principal: PrincipalContext = {
      audience: [],
      authMethod: "oauth",
      capabilities: record.granted.capabilities,
      delegationChain: [],
      issuer: "engenty-core",
      moduleIds: record.granted.moduleIds,
      permissions: [],
      principalId: record.approvedBy,
      principalType: "user",
      roleProfiles: [],
      roles: [],
      scopes: record.granted.scopes,
      sessionId,
      tenantId: record.approvedTenantId,
      tokenType: "access",
      transport: "cli",
    };
    const refreshTokenId = uuidv7();
    const refreshToken = await signPrincipalToken({
      expiresInSeconds: ttlFromMinutes(60 * 24 * 14),
      principal,
      secret,
      sessionId,
      tokenId: refreshTokenId,
      tokenType: "refresh",
    });
    const accessToken = await signPrincipalToken({
      expiresInSeconds: ttlFromMinutes(15),
      principal,
      secret,
      sessionId,
      tokenType: "access",
    });
    await params.stores.sessions.insert({
      createdAt: nowEpochSeconds(),
      expiresAt: nowEpochSeconds() + ttlFromMinutes(60 * 24 * 14),
      id: sessionId,
      principalId: principal.principalId,
      refreshTokenHash: toHash(refreshToken),
      refreshTokenId,
      tenantId: principal.tenantId,
    });
    recordCoreAuditEvent(params.auditLog, {
      type: "auth.login_completed",
      actorId: principal.principalId,
      tenantId: principal.tenantId,
      detail: { method: "device_code", sessionId },
    });
    return c.json({
      // camelCase: engenty CLI; snake_case: RFC clients (auth.md protocol)
      accessToken,
      access_token: accessToken,
      expiresIn: ttlFromMinutes(15),
      expires_in: ttlFromMinutes(15),
      refreshToken,
      refresh_token: refreshToken,
      scope: principal.scopes.join(" "),
      sessionId,
      tokenType: "Bearer",
      token_type: "Bearer",
    });
  };
  params.app.post("/api/auth/device/token", handler);
  params.app.post("/oauth2/token", handler);
}
