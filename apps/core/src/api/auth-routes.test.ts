import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugins/registry.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createMemoryAuthStores } from "../security/auth-stores/index.js";
import { createApiApp } from "./server.js";

function makeEmptyRegistry(): PluginRegistry {
  return {
    plugins: [],
    cliRegistrars: [],
    diagnostics: [],
    services: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
  };
}

async function createBootstrapToken(secret: string): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "user",
    capabilities: ["module.read", "module.write"],
    scopes: ["default"],
    module_ids: ["contacts", "invoices"],
    roles: ["admin"],
    permissions: ["cap:module.read", "cap:module.write"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("20m")
    .setJti("bootstrap-jti")
    .sign(new TextEncoder().encode(secret));
}

describe("auth routes", () => {
  it("device authorize no longer mints identity-bound tokens (open mint removed)", async () => {
    const secret = "test-security-secret";
    const app = createApiApp({
      registry: makeEmptyRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      authStores: createMemoryAuthStores(),
    });

    // The request may carry a wish list, but identity/capabilities are ignored:
    // the authorization stays pending until a logged-in user approves it.
    const authorize = await app.request("/api/auth/device/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        principalId: "agent-1",
        tenantId: "tenant-1",
        principalType: "agent",
        capabilities: ["core.superadmin"],
      }),
    });
    expect(authorize.status).toBe(200);
    const authorizeBody = (await authorize.json()) as {
      deviceCode: string;
      userCode: string;
    };
    expect(authorizeBody.deviceCode).toBeTruthy();
    expect(authorizeBody.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

    const token = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceCode: authorizeBody.deviceCode }),
    });
    expect(token.status).toBe(400);
    expect(((await token.json()) as { error: string }).error).toBe(
      "authorization_pending"
    );
  });
  it("creates, lists, revokes, and invalidates api tokens", async () => {
    const secret = "test-security-secret";
    const bootstrap = await createBootstrapToken(secret);
    const app = createApiApp({
      registry: makeEmptyRegistry(),
      config: { securityJwtSecret: secret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
      authStores: createMemoryAuthStores(),
    });

    const createRes = await app.request("/api/auth/api-tokens", {
      method: "POST",
      headers: {
        authorization: `Bearer ${bootstrap}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "ci-token",
        capabilities: ["module.read"],
        moduleIds: ["contacts"],
        scopes: ["default"],
      }),
    });
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as {
      tokenId: string;
      token: string;
    };
    expect(created.tokenId).toBeTruthy();
    expect(created.token).toBeTruthy();

    const listRes = await app.request("/api/auth/api-tokens", {
      headers: {
        authorization: `Bearer ${bootstrap}`,
      },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as {
      tokens: Array<{ tokenId: string; revoked: boolean }>;
    };
    expect(listBody.tokens.some((row) => row.tokenId === created.tokenId)).toBe(
      true
    );

    const revokeRes = await app.request(
      `/api/auth/api-tokens/${created.tokenId}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${bootstrap}`,
        },
      }
    );
    expect(revokeRes.status).toBe(200);

    const introspectRevoked = await app.request("/api/auth/token/introspect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: created.token }),
    });
    expect(introspectRevoked.status).toBe(200);
    const introspectBody = (await introspectRevoked.json()) as {
      active: boolean;
    };
    expect(introspectBody.active).toBe(false);
  });
});
