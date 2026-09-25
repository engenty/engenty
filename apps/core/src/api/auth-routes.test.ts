import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createMemoryAuthStores } from "../security/auth-stores/index.js";
import { createApiApp } from "./server.js";

const SECRET = "test-security-secret";

async function createOwnerToken(): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "user",
    capabilities: ["module.read", "core.credentials.manage"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("20m")
    .sign(new TextEncoder().encode(SECRET));
}

describe("auth routes", () => {
  it("a revoked api token is no longer active", async () => {
    const owner = await createOwnerToken();
    const app = createApiApp({
      registry: makeEmptyRegistry(),
      config: { securityJwtSecret: SECRET },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      authStores: createMemoryAuthStores(),
    });

    const createRes = await app.request("/api/auth/api-tokens", {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "ci-token", capabilities: ["module.read"] }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      tokenId: string;
      token: string;
    };

    const revokeRes = await app.request(
      `/api/auth/api-tokens/${created.tokenId}`,
      { method: "DELETE", headers: { authorization: `Bearer ${owner}` } }
    );
    expect(revokeRes.status).toBe(200);

    const introspect = await app.request("/api/auth/token/introspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: created.token }),
    });
    expect(introspect.status).toBe(200);
    expect(((await introspect.json()) as { active: boolean }).active).toBe(
      false
    );
  });
});
