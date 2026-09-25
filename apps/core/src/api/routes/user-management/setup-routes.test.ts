import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";
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
    capabilities: [],
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

describe("GET /api/users/setup/context", () => {
  it("still routes a user token through the Supabase path", async () => {
    const app = createApp({
      getServiceWorkspaceContext: () =>
        Promise.resolve(baseContext({ tenantRole: "service" })),
      getWorkspaceContext: () =>
        Promise.resolve(baseContext({ tenantRole: "member" })),
    });

    const token = await makeToken({
      principalId: uuidv7(),
      role: "user",
      tenantId: uuidv7(),
    });
    const res = await app.request("/api/users/setup/context", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { tenantRole: string } };
    expect(body.data.tenantRole).toBe("member");
  });

  it("rejects a missing bearer", async () => {
    const app = createApp({});
    const res = await app.request("/api/users/setup/context");
    expect(res.status).toBe(401);
  });
});
