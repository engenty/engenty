import { OpenAPIHono } from "@hono/zod-openapi";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import type { PrincipalContext } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import {
  IMPERSONATE_SUPERADMIN_CAPABILITY,
  registerImpersonateRoutes,
} from "./impersonate-routes.js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      admin: {
        generateLink: vi.fn(),
        getUserById: vi.fn(),
      },
      verifyOtp: vi.fn(),
    },
  }),
}));

function principal(overrides: Partial<PrincipalContext>): PrincipalContext {
  return {
    audience: ["engenty"],
    authMethod: "oauth",
    capabilities: [],
    delegationChain: [],
    moduleIds: [],
    permissions: [],
    principalId: `user-${uuidv7()}`,
    principalType: "user",
    roleProfiles: [],
    roles: [],
    scopes: [],
    tenantId: "tenant-fixed",
    tokenType: "access",
    ...overrides,
  };
}

function createApp(caller: PrincipalContext | null) {
  const app = new OpenAPIHono();
  const authProvider = {
    resolveAdminFallback: () => Promise.resolve(caller),
    resolvePrincipal: () => Promise.resolve(caller),
    resolveTenantForSession: () => Promise.resolve(caller?.tenantId ?? null),
    verifyToken: () => Promise.resolve(caller),
  } as unknown as AuthProvider;

  registerImpersonateRoutes({
    app,
    auditLog: createNoopAuditLog(),
    authProvider,
    config: {
      supabaseAnonKey: "test-anon-key",
      supabaseServiceRoleKey: "test-service-role-key",
      supabaseUrl: "http://127.0.0.1:54321",
    },
    mintSession: async () => ({
      access_token: "minted-access",
      refresh_token: "minted-refresh",
    }),
    lookupAuthUser: async (_admin, userId) => ({
      id: userId,
      email: `${userId}@example.com`,
      display_name: null,
    }),
  });
  return app;
}

async function postImpersonate(
  app: OpenAPIHono,
  body: Record<string, unknown>
): Promise<Response> {
  return await app.request("/api/auth/impersonate", {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer whatever-the-provider-is-stubbed",
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/auth/impersonate", () => {
  const targetId = `user-${uuidv7()}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses unauthenticated callers", async () => {
    const app = createApp(null);
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(401);
  });

  it("refuses a tenant admin holding * but not core.superadmin", async () => {
    const app = createApp(
      principal({
        capabilities: ["core.credentials.manage", "*"],
        roleProfiles: ["tenant.admin"],
      })
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("refuses service principals", async () => {
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        principalType: "service",
      })
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(403);
  });

  it("mints a session for a platform superadmin", async () => {
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        roleProfiles: ["core.superadmin"],
      })
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { access_token: string }).access_token).toBe(
      "minted-access"
    );
  });
});
