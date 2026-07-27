import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { describe, expect, it, vi } from "vitest";
import type {
  CoreUsersDal,
  WorkspaceContextResult,
} from "../../../dal/core-users.js";
import { registerUserManagementSetupRoutes } from "./setup-routes.js";

const TEST_SECRET = "test-jwt-secret-for-setup-routes";

function baseContext(
  overrides: Partial<WorkspaceContextResult> = {}
): WorkspaceContextResult {
  return {
    canSwitchTenant: false,
    currentTenant: { id: uuidv7(), name: "Acme", slug: "acme" },
    currentUser: {
      display_name: null,
      email: null,
      id: uuidv7(),
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
    tenantRole: null,
    tenantSupportedLocales: [],
    tenants: [],
    userId: uuidv7(),
    ...overrides,
  };
}

function createApp(dal: Partial<CoreUsersDal>) {
  const app = new OpenAPIHono();
  registerUserManagementSetupRoutes({
    app,
    config: { securityJwtSecret: TEST_SECRET },
    getDal: () => dal as CoreUsersDal,
  });
  return app;
}

async function makeToken(params: {
  principalId: string;
  role: "user" | "service";
  tenantId: string;
}): Promise<string> {
  return await new SignJWT({
    auth_method: params.role === "service" ? "service_credential" : "oauth",
    capabilities: ["module.read"],
    delegation_chain: [],
    module_ids: [],
    permissions: [],
    role: params.role,
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
    .setExpirationTime("900s")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

describe("GET /api/users/setup/context — service principals", () => {
  it("answers from the service path without touching the Supabase user path", async () => {
    const tenantId = uuidv7();
    const credentialId = uuidv7();
    const getWorkspaceContext = vi.fn(() =>
      Promise.reject(new Error("resolveAuthUser must never run for a service"))
    );
    const getServiceWorkspaceContext = vi.fn(() =>
      Promise.resolve(
        baseContext({
          currentTenant: { id: tenantId, name: "Acme", slug: "acme" },
          tenantRole: "service",
          userId: credentialId,
        })
      )
    );
    const app = createApp({ getServiceWorkspaceContext, getWorkspaceContext });

    const token = await makeToken({
      principalId: credentialId,
      role: "service",
      tenantId,
    });
    const res = await app.request("/api/users/setup/context", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(getWorkspaceContext).not.toHaveBeenCalled();
    expect(getServiceWorkspaceContext).toHaveBeenCalledWith({
      principalId: credentialId,
      tenantId,
    });
    const body = (await res.json()) as {
      data: { onboarded: boolean; tenantRole: string; userId: string };
    };
    // The AI scope resolver bounces anything that is not onboarded with a
    // tenant, so these three fields are the contract that keeps headless
    // runs working.
    expect(body.data.onboarded).toBe(true);
    expect(body.data.tenantRole).toBe("service");
    expect(body.data.userId).toBe(credentialId);
  });

  it("still routes a user token through the Supabase path", async () => {
    const getWorkspaceContext = vi.fn(() =>
      Promise.resolve(baseContext({ tenantRole: "member" }))
    );
    const getServiceWorkspaceContext = vi.fn(() =>
      Promise.reject(new Error("service path must not run for a user"))
    );
    const app = createApp({ getServiceWorkspaceContext, getWorkspaceContext });

    const token = await makeToken({
      principalId: uuidv7(),
      role: "user",
      tenantId: uuidv7(),
    });
    const res = await app.request("/api/users/setup/context", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(getServiceWorkspaceContext).not.toHaveBeenCalled();
    expect(getWorkspaceContext).toHaveBeenCalledWith(token);
  });

  it("routes an unrecognised bearer through the Supabase path, not the service one", async () => {
    // A Supabase session token is not signed with our secret, so
    // verifyAccessToken returns null — it must fall through, not 401.
    const getWorkspaceContext = vi.fn(() => Promise.resolve(baseContext()));
    const getServiceWorkspaceContext = vi.fn(() =>
      Promise.reject(new Error("service path must not run"))
    );
    const app = createApp({ getServiceWorkspaceContext, getWorkspaceContext });

    const res = await app.request("/api/users/setup/context", {
      headers: { authorization: "Bearer not-an-engenty-token" },
    });

    expect(res.status).toBe(200);
    expect(getServiceWorkspaceContext).not.toHaveBeenCalled();
    expect(getWorkspaceContext).toHaveBeenCalledWith("not-an-engenty-token");
  });

  it("rejects a missing bearer", async () => {
    const app = createApp({
      getServiceWorkspaceContext: vi.fn(),
      getWorkspaceContext: vi.fn(),
    });
    const res = await app.request("/api/users/setup/context");
    expect(res.status).toBe(401);
  });
});
