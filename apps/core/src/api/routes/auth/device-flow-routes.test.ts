import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import type { AuthStores } from "../../../security/auth-stores/index.js";
import { createMemoryAuthStores } from "../../../security/auth-stores/index.js";
import {
  type ApproverRoleResolver,
  generateUserCode,
  normalizeUserCode,
  registerDeviceFlowRoutes,
} from "./device-flow-routes.js";

const TEST_SECRET = "device-flow-test-secret-at-least-32-chars";
const TENANT = "11111111-1111-7111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-7222-8222-222222222222";

async function userToken(userId: string, capabilities: string[] = []) {
  return await new SignJWT({
    tenant_id: TENANT,
    role: "user",
    token_type: "access",
    auth_method: "oauth",
    scopes: [],
    module_ids: [],
    capabilities,
    role_profiles: [],
    roles: [],
    permissions: [],
    delegation_chain: [],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime("3600s")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

type Memberships = Record<string, Record<string, "admin" | "member">>;

function buildApp(memberships: Memberships): {
  app: OpenAPIHono;
  stores: AuthStores;
} {
  const app = new OpenAPIHono();
  const stores = createMemoryAuthStores();
  const resolveApproverRole: ApproverRoleResolver = ({ tenantId, userId }) => {
    const role = memberships[userId]?.[tenantId] ?? null;
    return Promise.resolve({ isMember: role !== null, tenantRole: role });
  };
  registerDeviceFlowRoutes({
    app,
    auditLog: createNoopAuditLog(),
    config: { securityJwtSecret: TEST_SECRET },
    resolveApproverRole,
    stores,
  });
  return { app, stores };
}

async function post(
  app: OpenAPIHono,
  path: string,
  body: unknown,
  token?: string
) {
  return await app.request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function startFlow(app: OpenAPIHono, capabilities: string[] = []) {
  const res = await post(app, "/api/auth/device/authorize", { capabilities });
  expect(res.status).toBe(200);
  return (await res.json()) as { deviceCode: string; userCode: string };
}

describe("device flow", () => {
  let memberships: Memberships;

  beforeEach(() => {
    memberships = {
      "admin-user": { [TENANT]: "admin" },
      "member-user": { [TENANT]: "member" },
    };
  });

  it("authorize never accepts identity/capability grants directly", async () => {
    const { app, stores } = buildApp(memberships);
    const res = await post(app, "/api/auth/device/authorize", {
      principalId: "evil",
      tenantId: TENANT,
      capabilities: ["core.superadmin"],
    });
    const payload = (await res.json()) as {
      deviceCode: string;
      userCode: string;
    };
    // The request is recorded only as a wish list on a PENDING record.
    const record = await stores.devices.getPendingByUserCode(payload.userCode);
    expect(record?.status).toBe("pending");
    expect(record?.granted).toBeUndefined();
  });

  it("pending poll returns authorization_pending, never tokens", async () => {
    const { app } = buildApp(memberships);
    const { deviceCode } = await startFlow(app);
    const res = await post(app, "/api/auth/device/token", { deviceCode });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "authorization_pending"
    );
  });

  it("fast re-poll returns slow_down", async () => {
    const { app } = buildApp(memberships);
    const { deviceCode } = await startFlow(app);
    await post(app, "/api/auth/device/token", { deviceCode });
    const res = await post(app, "/api/auth/device/token", { deviceCode });
    expect(((await res.json()) as { error: string }).error).toBe("slow_down");
  });

  it("happy path: approve as admin → token bound to approver with clamped caps", async () => {
    const { app } = buildApp(memberships);
    const { deviceCode, userCode } = await startFlow(app, [
      "module.read",
      "core.superadmin",
    ]);
    const approve = await post(
      app,
      "/api/auth/device/approve",
      { userCode, tenantId: TENANT, action: "approve" },
      await userToken("admin-user")
    );
    expect(approve.status).toBe(200);
    const approvePayload = (await approve.json()) as {
      granted: { capabilities: string[] };
    };
    // admin grant is ["*"] → both requests covered
    expect(approvePayload.granted.capabilities).toEqual([
      "module.read",
      "core.superadmin",
    ]);

    const tokenRes = await post(app, "/api/auth/device/token", { deviceCode });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as { accessToken: string };
    const claims = JSON.parse(
      Buffer.from(tokens.accessToken.split(".")[1], "base64url").toString()
    ) as Record<string, unknown>;
    expect(claims.sub).toBe("admin-user");
    expect(claims.tenant_id).toBe(TENANT);
  });

  it("member approval grants module caps but clamps away core/superadmin", async () => {
    const { app } = buildApp(memberships);
    // Members are module.*-capable (they use modules in the app), so a member
    // device token must carry module caps too — but never core/superadmin.
    const { userCode } = await startFlow(app, [
      "module.write",
      "user-settings.read",
      "core.superadmin",
    ]);
    const approve = await post(
      app,
      "/api/auth/device/approve",
      { userCode, tenantId: TENANT, action: "approve" },
      await userToken("member-user")
    );
    const payload = (await approve.json()) as {
      granted: { capabilities: string[] };
    };
    expect(payload.granted.capabilities).toEqual([
      "module.write",
      "user-settings.read",
    ]);
  });

  it("approving a foreign tenant is rejected", async () => {
    const { app, stores } = buildApp(memberships);
    const { userCode } = await startFlow(app);
    const res = await post(
      app,
      "/api/auth/device/approve",
      { userCode, tenantId: OTHER_TENANT, action: "approve" },
      await userToken("member-user")
    );
    expect(res.status).toBe(403);
    const record = await stores.devices.getPendingByUserCode(userCode);
    expect(record?.status).toBe("pending");
  });

  it("denied flow returns access_denied to the poller", async () => {
    const { app } = buildApp(memberships);
    const { deviceCode, userCode } = await startFlow(app);
    await post(
      app,
      "/api/auth/device/approve",
      { userCode, action: "deny" },
      await userToken("member-user")
    );
    const res = await post(app, "/api/auth/device/token", { deviceCode });
    expect(((await res.json()) as { error: string }).error).toBe(
      "access_denied"
    );
  });

  it("tokens are issued exactly once (second consume fails)", async () => {
    const { app } = buildApp(memberships);
    const { deviceCode, userCode } = await startFlow(app);
    await post(
      app,
      "/api/auth/device/approve",
      { userCode, tenantId: TENANT, action: "approve" },
      await userToken("admin-user")
    );
    const first = await post(app, "/api/auth/device/token", { deviceCode });
    expect(first.status).toBe(200);
    const second = await post(app, "/api/auth/device/token", { deviceCode });
    expect(second.status).toBe(400);
    expect(((await second.json()) as { error: string }).error).toBe(
      "invalid_grant"
    );
  });

  it("speaks RFC wire format: form-encoded snake_case on /oauth2/* aliases", async () => {
    const { app } = buildApp(memberships);
    const authorize = await app.request("/oauth2/device_authorization", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_name: "rfc-client" }).toString(),
    });
    expect(authorize.status).toBe(200);
    const payload = (await authorize.json()) as {
      device_code: string;
      user_code: string;
      verification_uri_complete: string;
    };
    expect(payload.device_code).toBeTruthy();
    expect(payload.user_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    await post(
      app,
      "/api/auth/device/approve",
      {
        userCode: payload.user_code,
        tenantId: TENANT,
        action: "approve",
      },
      await userToken("admin-user")
    );

    const token = await app.request("/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: payload.device_code,
      }).toString(),
    });
    expect(token.status).toBe(200);
    const tokens = (await token.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
    };
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.token_type).toBe("Bearer");
  });

  it("unknown device code → invalid_grant; approval needs auth", async () => {
    const { app } = buildApp(memberships);
    const bad = await post(app, "/api/auth/device/token", {
      deviceCode: "eng_device_nope",
    });
    expect(((await bad.json()) as { error: string }).error).toBe(
      "invalid_grant"
    );
    const unauth = await post(app, "/api/auth/device/approve", {
      userCode: "AAAA-AAAA",
      tenantId: TENANT,
    });
    expect(unauth.status).toBe(401);
  });
});

describe("user codes", () => {
  it("generates grouped codes from the unambiguous alphabet", () => {
    const code = generateUserCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });

  it("normalizes user input", () => {
    expect(normalizeUserCode("abcd efgh")).toBe("ABCD-EFGH");
    expect(normalizeUserCode("AbCd-EfGh")).toBe("ABCD-EFGH");
  });
});
