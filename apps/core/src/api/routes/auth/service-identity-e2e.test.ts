/**
 * CP2 + CP3 composed: a token minted from a durable service credential must be
 * accepted by workspace-context resolution as a service principal.
 *
 * The unit tests on either side mock the other; this one wires the real routes
 * together, because the failure mode that actually costs a production incident
 * is the two halves disagreeing — the exchange succeeding and the scheduler
 * still being unable to resolve a scope from what it got back.
 */
import { OpenAPIHono } from "@hono/zod-openapi";
import { uuidv7 } from "uuidv7";
import { describe, expect, it, vi } from "vitest";
import type {
  CoreUsersDal,
  WorkspaceContextResult,
} from "../../../dal/core-users.js";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import { createMemoryAuthStores } from "../../../security/auth-stores/index.js";
import { registerUserManagementSetupRoutes } from "../user-management/setup-routes.js";
import { registerAuthRoutes } from "./auth-routes.js";

const TEST_SECRET = "test-jwt-secret-for-service-identity-e2e";

/** The exact fields apps/ai's token vendor sends and reads. */
interface ExchangeResponse {
  expiresIn: number;
  token: string;
}

describe("service identity — credential to workspace context", () => {
  function createStack(tenantId: string) {
    const app = new OpenAPIHono();
    const config = { securityJwtSecret: TEST_SECRET };
    registerAuthRoutes({
      app,
      auditLog: createNoopAuditLog(),
      config,
      stores: createMemoryAuthStores(),
    });
    const getServiceWorkspaceContext = vi.fn(
      ({ principalId }: { principalId: string; tenantId: string }) =>
        Promise.resolve({
          canSwitchTenant: false,
          currentTenant: { id: tenantId, name: "Acme", slug: "acme" },
          currentUser: {
            display_name: null,
            email: null,
            id: principalId,
            initials: null,
            role: null,
          },
          isSuperAdmin: false,
          isTenantAdmin: false,
          onboarded: true,
          planLabel: "local",
          resolvedAppearance: {
            font: "sans",
            fontSize: "md",
            language: "en",
            themeMode: "light",
          },
          capabilities: ["module.read", "module.write", "module.execute"],
          tenantRole: "service",
          tenantSupportedLocales: [],
          tenants: [{ id: tenantId, name: "Acme", slug: "acme" }],
          userId: principalId,
        } satisfies WorkspaceContextResult)
    );
    registerUserManagementSetupRoutes({
      app,
      config,
      getDal: () =>
        ({
          getServiceWorkspaceContext,
          getWorkspaceContext: () =>
            Promise.reject(new Error("the Supabase user path must not run")),
        }) as unknown as CoreUsersDal,
    });
    return { app, getServiceWorkspaceContext };
  }

  it("mints from the credential, then resolves a service scope from that token", async () => {
    const tenantId = uuidv7();
    const { app, getServiceWorkspaceContext } = createStack(tenantId);

    // 1. An operator creates the credential (this is `engenty service-token create`).
    const ownerToken = await mintOwnerToken(tenantId);
    const created = (await (
      await app.request("/api/auth/service-credentials", {
        body: JSON.stringify({
          capabilities: ["module.read", "module.write", "module.execute"],
          name: "ai-service",
        }),
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      })
    ).json()) as { credentialId: string; secret: string };

    // 2. apps/ai splits ENGENTY_AI_SERVICE_SECRET and exchanges it. The split
    //    and the field names here mirror service-credential.ts exactly.
    const separator = created.secret.indexOf(".");
    const exchange = await app.request("/api/auth/service-token", {
      body: JSON.stringify({
        credentialId: created.secret.slice(0, separator),
        secret: created.secret.slice(separator + 1),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(exchange.status).toBe(200);
    const minted = (await exchange.json()) as ExchangeResponse;
    expect(minted.token).toBeTruthy();
    expect(minted.expiresIn).toBe(900);

    // 3. The scheduler resolves its scope with that token — the step that
    //    silently failed before CP3, because the token has no auth.users row.
    const context = await app.request("/api/users/setup/context", {
      headers: { authorization: `Bearer ${minted.token}` },
    });
    expect(context.status).toBe(200);
    const body = (await context.json()) as {
      data: { currentTenant: { id: string }; onboarded: boolean };
    };
    expect(body.data.onboarded).toBe(true);
    expect(body.data.currentTenant.id).toBe(tenantId);
    // Resolved by credential id, in the credential's tenant — no user involved.
    expect(getServiceWorkspaceContext).toHaveBeenCalledWith({
      // A minted service credential carries the service default bundle, and it
      // reaches the workspace context verbatim (AUTH-06) — never widened into a
      // role. Notably module-tier only: it covers no `core.*` capability.
      capabilities: ["module.read", "module.write", "module.execute"],
      principalId: created.credentialId,
      tenantId,
    });
  });

  it("stops resolving scopes once the credential is revoked", async () => {
    const tenantId = uuidv7();
    const { app } = createStack(tenantId);
    const ownerToken = await mintOwnerToken(tenantId);
    const created = (await (
      await app.request("/api/auth/service-credentials", {
        body: JSON.stringify({ name: "ai-service" }),
        headers: {
          authorization: `Bearer ${ownerToken}`,
          "content-type": "application/json",
        },
        method: "POST",
      })
    ).json()) as { credentialId: string; secret: string };

    await app.request(`/api/auth/service-credentials/${created.credentialId}`, {
      headers: { authorization: `Bearer ${ownerToken}` },
      method: "DELETE",
    });

    const separator = created.secret.indexOf(".");
    const exchange = await app.request("/api/auth/service-token", {
      body: JSON.stringify({
        credentialId: created.secret.slice(0, separator),
        secret: created.secret.slice(separator + 1),
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    // Revocation bites at the exchange. Tokens already minted run out their
    // remaining TTL — that is the documented lag, not a bug.
    expect(exchange.status).toBe(401);
  });
});

/**
 * A tenant admin's session token. Built through the device-flow-shaped claims
 * rather than a helper so this file does not depend on test utilities that
 * could drift from what core actually verifies.
 */
async function mintOwnerToken(tenantId: string): Promise<string> {
  const { SignJWT } = await import("jose");
  return await new SignJWT({
    auth_method: "oauth",
    capabilities: ["*"],
    delegation_chain: [],
    module_ids: [],
    permissions: [],
    role: "user",
    role_profiles: [],
    roles: ["admin"],
    scopes: [],
    tenant_id: tenantId,
    token_type: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(uuidv7())
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setJti(uuidv7())
    .setExpirationTime("3600s")
    .sign(new TextEncoder().encode(TEST_SECRET));
}
