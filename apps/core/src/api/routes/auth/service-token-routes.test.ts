import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import { verifyAccessToken } from "../../../security/auth.js";
import { createMemoryAuthStores } from "../../../security/auth-stores/index.js";
import { registerAuthRoutes, toHash } from "./auth-routes.js";

const TEST_SECRET = "test-jwt-secret-for-service-token-routes";

async function makeOwnerToken(params: {
  capabilities?: string[];
  principalId: string;
  tenantId: string;
}): Promise<string> {
  return await new SignJWT({
    auth_method: "oauth",
    capabilities: params.capabilities ?? ["*"],
    delegation_chain: [],
    module_ids: [],
    permissions: [],
    role: "user",
    role_profiles: [],
    roles: [],
    scopes: [],
    tenant_id: params.tenantId,
    token_type: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(params.principalId)
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime("3600s")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function createApp(options?: {
  stores?: ReturnType<typeof createMemoryAuthStores>;
  tenantExists?: (tenantId: string) => Promise<boolean>;
}) {
  const app = new OpenAPIHono();
  registerAuthRoutes({
    app,
    auditLog: createNoopAuditLog(),
    config: { securityJwtSecret: TEST_SECRET },
    stores: options?.stores ?? createMemoryAuthStores(),
    ...(options?.tenantExists ? { tenantExists: options.tenantExists } : {}),
  });
  return app;
}

interface CreatedCredential {
  capabilities: string[];
  credentialId: string;
  name: string;
  secret: string;
}

async function createCredential(
  app: OpenAPIHono,
  ownerToken: string,
  body: Record<string, unknown> = {}
): Promise<CreatedCredential> {
  const res = await app.request("/api/auth/service-credentials", {
    body: JSON.stringify({ name: "ai-service", ...body }),
    headers: {
      authorization: `Bearer ${ownerToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  expect(res.status).toBe(200);
  return (await res.json()) as CreatedCredential;
}

/** Split the `<credentialId>.<rawSecret>` env format back into its halves. */
function splitSecret(secret: string): { credentialId: string; raw: string } {
  const separator = secret.indexOf(".");
  return {
    credentialId: secret.slice(0, separator),
    raw: secret.slice(separator + 1),
  };
}

async function exchange(
  app: OpenAPIHono,
  body: Record<string, unknown>
): Promise<Response> {
  return await app.request("/api/auth/service-token", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/auth/service-credentials — creation", () => {
  let app: OpenAPIHono;
  let tenantId: string;
  let ownerToken: string;

  beforeEach(async () => {
    app = createApp();
    tenantId = `tenant-${uuidv7()}`;
    ownerToken = await makeOwnerToken({
      principalId: `user-${uuidv7()}`,
      tenantId,
    });
  });

  it("rejects an unauthenticated creator", async () => {
    const res = await app.request("/api/auth/service-credentials", {
      body: JSON.stringify({ name: "ai-service" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("never returns the secret again from the listing", async () => {
    const created = await createCredential(app, ownerToken);
    const res = await app.request("/api/auth/service-credentials", {
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credentials: unknown[] };
    expect(JSON.stringify(body)).not.toContain(splitSecret(created.secret).raw);
    expect(body.credentials).toHaveLength(1);
  });
});

describe("POST /api/auth/service-token — exchange", () => {
  let app: OpenAPIHono;
  let tenantId: string;
  let ownerToken: string;
  let created: CreatedCredential;
  let raw: string;

  beforeEach(async () => {
    app = createApp();
    tenantId = `tenant-${uuidv7()}`;
    ownerToken = await makeOwnerToken({
      capabilities: ["*"],
      principalId: `user-${uuidv7()}`,
      tenantId,
    });
    created = await createCredential(app, ownerToken);
    raw = splitSecret(created.secret).raw;
  });

  it("mints a 15-minute service access token that verifies as a service principal", async () => {
    const res = await exchange(app, {
      credentialId: created.credentialId,
      secret: raw,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expiresIn: number; token: string };
    expect(body.expiresIn).toBe(900);

    const principal = await verifyAccessToken(
      `Bearer ${body.token}`,
      TEST_SECRET,
      { transport: "rest" }
    );
    expect(principal).not.toBeNull();
    expect(principal?.principalType).toBe("service");
    expect(principal?.authMethod).toBe("service_credential");
    // sub is the credential id — that is what makes an audit trail attributable.
    expect(principal?.principalId).toBe(created.credentialId);
    expect(principal?.tenantId).toBe(tenantId);
    expect(principal?.tokenId).toBeTruthy();
  });

  it("carries the credential's capabilities, not the creator's", async () => {
    const limitedOwner = await makeOwnerToken({
      capabilities: ["module.read", "module.write", "core.credentials.manage"],
      principalId: `user-${uuidv7()}`,
      tenantId,
    });
    const limited = await createCredential(app, limitedOwner, {
      capabilities: ["module.read"],
      name: "narrow-service",
    });
    const res = await exchange(app, {
      credentialId: limited.credentialId,
      secret: splitSecret(limited.secret).raw,
    });
    const body = (await res.json()) as { token: string };
    const principal = await verifyAccessToken(
      `Bearer ${body.token}`,
      TEST_SECRET,
      { transport: "rest" }
    );
    expect(principal?.capabilities).toEqual(["module.read"]);
  });

  it("rejects a wrong secret", async () => {
    const res = await exchange(app, {
      credentialId: created.credentialId,
      secret: "engsvc_wrong",
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_client" });
  });

  it("rejects an unknown credential with the same answer as a wrong secret", async () => {
    const res = await exchange(app, {
      credentialId: uuidv7(),
      secret: raw,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_client" });
  });

  it("stops working once the credential is revoked", async () => {
    expect(
      (await exchange(app, { credentialId: created.credentialId, secret: raw }))
        .status
    ).toBe(200);

    const revoked = await app.request(
      `/api/auth/service-credentials/${created.credentialId}`,
      {
        headers: { authorization: `Bearer ${ownerToken}` },
        method: "DELETE",
      }
    );
    expect(revoked.status).toBe(200);

    const after = await exchange(app, {
      credentialId: created.credentialId,
      secret: raw,
    });
    expect(after.status).toBe(401);
  });

  it("rate-limits repeated exchanges for one credential", async () => {
    // The window allows 60/min; the 61st must be refused rather than served.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 61; attempt++) {
      const res = await exchange(app, {
        credentialId: created.credentialId,
        secret: "engsvc_wrong",
      });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

describe("POST /api/auth/service-token — tenant scoping", () => {
  const RAW_SECRET = "engsvc_platform_raw";

  function insertCredential(
    stores: ReturnType<typeof createMemoryAuthStores>,
    tenantId: string | null
  ) {
    const id = uuidv7();
    void stores.serviceCredentials.insert({
      capabilities: ["*"],
      createdAt: Math.floor(Date.now() / 1000),
      id,
      name: "ai-service",
      secretHash: toHash(RAW_SECRET),
      tenantId,
    });
    return id;
  }

  async function mintedTenant(res: Response): Promise<string | undefined> {
    const body = (await res.json()) as { token: string };
    const principal = await verifyAccessToken(
      `Bearer ${body.token}`,
      TEST_SECRET,
      { transport: "rest" }
    );
    return principal?.tenantId;
  }

  it("a tenant-bound credential may name its own tenant, nothing else", async () => {
    const stores = createMemoryAuthStores();
    const app = createApp({ stores });
    const tenantId = `tenant-${uuidv7()}`;
    const credentialId = insertCredential(stores, tenantId);

    const own = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId,
    });
    expect(own.status).toBe(200);
    expect(await mintedTenant(own)).toBe(tenantId);

    const foreign = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId: `tenant-${uuidv7()}`,
    });
    expect(foreign.status).toBe(403);
  });

  it("a platform credential mints per named tenant and refuses to mint without one", async () => {
    const stores = createMemoryAuthStores();
    const app = createApp({ stores, tenantExists: async () => true });
    const credentialId = insertCredential(stores, null);

    const tenantA = `tenant-${uuidv7()}`;
    const tenantB = `tenant-${uuidv7()}`;
    const a = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId: tenantA,
    });
    const b = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId: tenantB,
    });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await mintedTenant(a)).toBe(tenantA);
    expect(await mintedTenant(b)).toBe(tenantB);

    // A token must always be tenant-scoped — no tenant, no mint.
    const bare = await exchange(app, { credentialId, secret: RAW_SECRET });
    expect(bare.status).toBe(400);
  });

  it("a platform credential cannot mint for a tenant that does not exist", async () => {
    const stores = createMemoryAuthStores();
    const known = `tenant-${uuidv7()}`;
    const app = createApp({
      stores,
      tenantExists: async (id) => id === known,
    });
    const credentialId = insertCredential(stores, null);

    const unknown = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId: `tenant-${uuidv7()}`,
    });
    expect(unknown.status).toBe(400);

    const ok = await exchange(app, {
      credentialId,
      secret: RAW_SECRET,
      tenantId: known,
    });
    expect(ok.status).toBe(200);
  });
});

describe("DELETE /api/auth/service-credentials/:id — tenancy", () => {
  it("will not let another tenant revoke a credential", async () => {
    const app = createApp();
    const tenantId = `tenant-${uuidv7()}`;
    const owner = await makeOwnerToken({
      principalId: `user-${uuidv7()}`,
      tenantId,
    });
    const created = await createCredential(app, owner);

    const stranger = await makeOwnerToken({
      principalId: `user-${uuidv7()}`,
      tenantId: `tenant-${uuidv7()}`,
    });
    const res = await app.request(
      `/api/auth/service-credentials/${created.credentialId}`,
      {
        headers: { authorization: `Bearer ${stranger}` },
        method: "DELETE",
      }
    );
    expect(res.status).toBe(404);

    // …and the credential still works for its owner.
    const exchanged = await exchange(app, {
      credentialId: created.credentialId,
      secret: splitSecret(created.secret).raw,
    });
    expect(exchanged.status).toBe(200);
  });

  it("does not list another tenant's credentials", async () => {
    const app = createApp();
    const owner = await makeOwnerToken({
      principalId: `user-${uuidv7()}`,
      tenantId: `tenant-${uuidv7()}`,
    });
    await createCredential(app, owner);
    const stranger = await makeOwnerToken({
      principalId: `user-${uuidv7()}`,
      tenantId: `tenant-${uuidv7()}`,
    });
    const res = await app.request("/api/auth/service-credentials", {
      headers: { authorization: `Bearer ${stranger}` },
    });
    const body = (await res.json()) as { credentials: unknown[] };
    expect(body.credentials).toEqual([]);
  });
});
