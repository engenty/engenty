// Both mint routes extend a credential's lifetime, so a valid token is never
// enough: the caller needs the mint capability and must not itself be derived.

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

describe("credential mint routes — authorization", () => {
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
  });

  it("refuses a service-token principal even holding `*`", async () => {
    const serviceToken = await signCaller({
      authMethod: "service_credential",
      capabilities: ["*"],
      expiresInSeconds: SERVICE_TOKEN_TTL_SECONDS,
      principalType: "service",
    });
    const res = await mint(app, "/api/auth/service-credentials", serviceToken);
    expect(res.status).toBe(403);
  });

  it("refuses an api-token principal even holding `*`", async () => {
    const apiToken = await signCaller({
      authMethod: "api_token",
      capabilities: ["*"],
      principalType: "agent",
      tokenType: "api_token",
    });
    const res = await mint(app, "/api/auth/api-tokens", apiToken);
    expect(res.status).toBe(403);
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
});
