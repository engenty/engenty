import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import { createMemoryAuthStores } from "../../../security/auth-stores/index.js";
import { registerAuthRoutes } from "./auth-routes.js";

const TEST_SECRET = "test-jwt-secret-for-auth-routes";

async function makeToken(params: {
  principalId: string;
  tenantId: string;
  tokenType?: "access" | "api_token";
  expiresInSeconds?: number;
  /** Defaults to a holder of `core.credentials.manage`, which minting requires. */
  capabilities?: string[];
}): Promise<string> {
  const tokenType = params.tokenType ?? "access";
  const expiresIn = params.expiresInSeconds ?? 3600;
  return await new SignJWT({
    tenant_id: params.tenantId,
    role: "user",
    token_type: tokenType,
    auth_method: "oauth",
    scopes: [],
    module_ids: [],
    capabilities: params.capabilities ?? [
      "module.read",
      "core.credentials.manage",
    ],
    role_profiles: [],
    roles: [],
    permissions: [],
    delegation_chain: [],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.principalId)
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime(`${expiresIn}s`)
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function createApp() {
  const app = new OpenAPIHono();
  registerAuthRoutes({
    app,
    config: { securityJwtSecret: TEST_SECRET },
    auditLog: createNoopAuditLog(),
    stores: createMemoryAuthStores(),
  });
  return app;
}

async function createApiToken(
  app: OpenAPIHono,
  ownerToken: string,
  name = "test-token"
): Promise<{ tokenId: string; token: string }> {
  const res = await app.request("/api/auth/api-tokens", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerToken}`,
    },
    body: JSON.stringify({ name, expiresInDays: 1 }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { tokenId: string; token: string };
}

describe("GET /api/auth/api-tokens — listing", () => {
  let app: OpenAPIHono;

  beforeEach(() => {
    app = createApp();
  });

  it("returns only the caller's own tokens, not tokens owned by other principals in the same tenant", async () => {
    const sharedTenantId = `tenant-${uuidv7()}`;
    const userAId = `user-a-${uuidv7()}`;
    const userBId = `user-b-${uuidv7()}`;

    const tokenA = await makeToken({
      principalId: userAId,
      tenantId: sharedTenantId,
    });
    const tokenB = await makeToken({
      principalId: userBId,
      tenantId: sharedTenantId,
    });

    const { tokenId: apiTokenIdA } = await createApiToken(
      app,
      tokenA,
      "token-a"
    );
    await createApiToken(app, tokenB, "token-b");

    const listRes = await app.request("/api/auth/api-tokens", {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as {
      tokens: Array<{ tokenId: string }>;
    };
    const ids = body.tokens.map((t) => t.tokenId);
    expect(ids).toContain(apiTokenIdA);
    expect(ids.length).toBe(1);
  });

  it("returns 401 when unauthenticated", async () => {
    app = createApp();
    const res = await app.request("/api/auth/api-tokens");
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/auth/api-tokens/:tokenId — ownership enforcement", () => {
  let app: OpenAPIHono;

  beforeEach(() => {
    app = createApp();
  });

  it("owner can delete their own token and it is revoked", async () => {
    const tenantId = `tenant-${uuidv7()}`;
    const ownerId = `owner-${uuidv7()}`;
    const ownerJwt = await makeToken({ principalId: ownerId, tenantId });

    const { tokenId } = await createApiToken(app, ownerJwt);

    const delRes = await app.request(`/api/auth/api-tokens/${tokenId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ownerJwt}` },
    });
    expect(delRes.status).toBe(200);
    const body = (await delRes.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    const listRes = await app.request("/api/auth/api-tokens", {
      headers: { authorization: `Bearer ${ownerJwt}` },
    });
    const listBody = (await listRes.json()) as {
      tokens: Array<{ tokenId: string; revoked: boolean }>;
    };
    const found = listBody.tokens.find((t) => t.tokenId === tokenId);
    expect(found?.revoked).toBe(true);
  });

  it("different principal in same tenant gets 404 and token is NOT revoked", async () => {
    const tenantId = `tenant-${uuidv7()}`;
    const ownerId = `owner-${uuidv7()}`;
    const attackerId = `attacker-${uuidv7()}`;

    const ownerJwt = await makeToken({ principalId: ownerId, tenantId });
    const attackerJwt = await makeToken({
      principalId: attackerId,
      tenantId,
    });

    const { tokenId } = await createApiToken(app, ownerJwt);

    const delRes = await app.request(`/api/auth/api-tokens/${tokenId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${attackerJwt}` },
    });
    expect(delRes.status).toBe(404);
    const body = (await delRes.json()) as { error: string };
    expect(body.error).toBe("Token not found");

    const listRes = await app.request("/api/auth/api-tokens", {
      headers: { authorization: `Bearer ${ownerJwt}` },
    });
    const listBody = (await listRes.json()) as {
      tokens: Array<{ tokenId: string; revoked: boolean }>;
    };
    const found = listBody.tokens.find((t) => t.tokenId === tokenId);
    expect(found).toBeDefined();
    expect(found?.revoked).toBe(false);
  });

  it("clamps api-token capabilities to the creator's grant", async () => {
    const app = createApp();
    const owner = await makeToken({
      // The mint capability lets them through the gate; module.read is the
      // whole of their actual authority, and that is what must be clamped to.
      capabilities: ["module.read", "core.credentials.manage"],
      principalId: "user-1",
      tenantId: "tenant-1",
    });
    const res = await app.request("/api/auth/api-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${owner}`,
      },
      body: JSON.stringify({
        name: "escalation-attempt",
        capabilities: ["core.superadmin", "module.read"],
      }),
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { capabilities: string[] };
    expect(payload.capabilities).toEqual(["module.read"]);
  });
});
