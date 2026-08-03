// AUTH-02 regression: the two mint routes escalate LIFETIME, so a valid token
// can never be their only gate.
//
// `POST /api/auth/service-credentials` hands back a never-expiring credential;
// `POST /api/auth/api-tokens` hands back a 30–90 day bearer. Both used to ask
// for nothing but `requireAuth` + a clamp to the caller's capabilities — so a
// holder of a 900-second service token could launder it into a durable one
// with identical power, which is the exact round trip service identity exists
// to prevent.

import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import { createMemoryAuthStores } from "../../../security/auth-stores/index.js";
import { CORE_ROLE_PROFILES } from "../../../security/role-profiles.js";
import {
  CREDENTIAL_MINT_CAPABILITY,
  registerAuthRoutes,
  SERVICE_TOKEN_TTL_SECONDS,
} from "./auth-routes.js";

const TEST_SECRET = "test-jwt-secret-for-credential-mint-gate";
const TENANT = "tenant-mint-gate";

const MINT_ROUTES = [
  "/api/auth/service-credentials",
  "/api/auth/api-tokens",
] as const;

async function signCaller(params: {
  authMethod?: "oauth" | "api_token" | "service_credential";
  capabilities: string[];
  expiresInSeconds?: number;
  principalType?: "user" | "agent" | "service";
  tokenType?: "access" | "api_token";
}): Promise<string> {
  return await new SignJWT({
    auth_method: params.authMethod ?? "oauth",
    capabilities: params.capabilities,
    delegation_chain: [],
    module_ids: [],
    permissions: [],
    role: params.principalType ?? "user",
    role_profiles: [],
    roles: [],
    scopes: [],
    tenant_id: TENANT,
    token_type: params.tokenType ?? "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(`principal-${uuidv7()}`)
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime(`${params.expiresInSeconds ?? 3600}s`)
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function createApp() {
  const app = new OpenAPIHono();
  registerAuthRoutes({
    app,
    auditLog: createNoopAuditLog(),
    config: { securityJwtSecret: TEST_SECRET },
    stores: createMemoryAuthStores(),
  });
  return app;
}

async function mint(
  app: OpenAPIHono,
  route: string,
  token: string
): Promise<Response> {
  return await app.request(route, {
    body: JSON.stringify({ name: "minted-by-test" }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("role profiles carry the mint capability where they should", () => {
  function profile(id: string): string[] {
    return CORE_ROLE_PROFILES.find((p) => p.id === id)?.capabilities ?? [];
  }

  it("tenant.admin holds core.credentials.manage", () => {
    expect(profile("tenant.admin")).toContain(CREDENTIAL_MINT_CAPABILITY);
  });

  it("tenant.member does not", () => {
    expect(profile("tenant.member")).not.toContain(CREDENTIAL_MINT_CAPABILITY);
  });

  it("neither agent bundle does", () => {
    expect(profile("agent.assistant")).not.toContain(
      CREDENTIAL_MINT_CAPABILITY
    );
    expect(profile("agent.base")).not.toContain(CREDENTIAL_MINT_CAPABILITY);
  });
});

describe("credential mint routes — authorization (AUTH-02)", () => {
  let app: OpenAPIHono;

  beforeEach(() => {
    app = createApp();
  });

  it.each(MINT_ROUTES)("%s refuses a tenant member", async (route) => {
    // The exact capability bundle `tenant.member` resolves to.
    const member = await signCaller({
      capabilities: [
        "module.*",
        "tenant-settings.read",
        "tenant-settings.write",
        "user-settings.read",
        "user-settings.write",
      ],
    });
    const res = await mint(app, route, member);
    expect(res.status).toBe(403);
    expect((await res.json()) as { reason: string }).toMatchObject({
      reason: `missing capability: ${CREDENTIAL_MINT_CAPABILITY}`,
    });
  });

  it.each(
    MINT_ROUTES
  )("%s refuses a service-token principal even holding `*`", async (route) => {
    // This is the laundering step: a 900-second service token buying a
    // durable credential of identical power.
    const serviceToken = await signCaller({
      authMethod: "service_credential",
      capabilities: ["*"],
      expiresInSeconds: SERVICE_TOKEN_TTL_SECONDS,
      principalType: "service",
    });
    const res = await mint(app, route, serviceToken);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toMatch(
      /derived credential cannot mint/
    );
  });

  it.each(
    MINT_ROUTES
  )("%s refuses an api-token principal even holding `*`", async (route) => {
    const apiToken = await signCaller({
      authMethod: "api_token",
      capabilities: ["*"],
      principalType: "agent",
      tokenType: "api_token",
    });
    const res = await mint(app, route, apiToken);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { reason: string }).reason).toMatch(
      /derived credential cannot mint/
    );
  });

  it.each(MINT_ROUTES)("%s allows a tenant admin", async (route) => {
    const admin = await signCaller({ capabilities: ["*"] });
    const res = await mint(app, route, admin);
    expect(res.status).toBe(200);
  });

  it("still clamps an admin's minted credential to their own set", async () => {
    const admin = await signCaller({
      capabilities: ["module.read", CREDENTIAL_MINT_CAPABILITY],
    });
    const res = await app.request("/api/auth/service-credentials", {
      body: JSON.stringify({
        capabilities: ["module.read", "core.superadmin"],
        name: "narrow",
      }),
      headers: {
        authorization: `Bearer ${admin}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as { capabilities: string[] }).toMatchObject({
      capabilities: ["module.read"],
    });
  });

  it("closes the full AUTH-01 → AUTH-02 chain", async () => {
    // The chain the audit described: member mints an actor token for an admin,
    // then launders it into a durable `*` credential. WS1 breaks the first
    // link; this asserts the second is independently shut, so neither fix is
    // load-bearing alone.
    const stolenAdminToken = await signCaller({ capabilities: ["*"] });
    const derived = await signCaller({
      authMethod: "service_credential",
      capabilities: ["*"],
      principalType: "service",
    });
    // A real admin session works…
    expect(
      (await mint(app, "/api/auth/service-credentials", stolenAdminToken))
        .status
    ).toBe(200);
    // …but nothing derived from one does.
    expect(
      (await mint(app, "/api/auth/service-credentials", derived)).status
    ).toBe(403);
  });
});
