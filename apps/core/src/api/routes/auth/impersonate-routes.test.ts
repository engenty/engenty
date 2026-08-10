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

function createApp(
  caller: PrincipalContext | null,
  options?: {
    mintSession?: () => Promise<{
      access_token: string;
      refresh_token: string;
    }>;
    lookupAuthUser?: (
      _admin: unknown,
      userId: string
    ) => Promise<{
      id: string;
      email: string;
      display_name: string | null;
    } | null>;
  }
) {
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
    mintSession:
      options?.mintSession ??
      (async () => ({
        access_token: "target-access",
        refresh_token: "target-refresh",
      })),
    lookupAuthUser:
      options?.lookupAuthUser ??
      (async (_admin, userId) => ({
        id: userId,
        email: `${userId}@example.com`,
        display_name: `User ${userId.slice(0, 8)}`,
      })),
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

  it("refuses a tenant member", async () => {
    const app = createApp(
      principal({
        capabilities: ["module.*", "tenant-settings.read"],
        roleProfiles: ["tenant.member"],
      })
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(403);
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

  it("refuses impersonating yourself", async () => {
    const callerId = `user-${uuidv7()}`;
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        principalId: callerId,
        roleProfiles: ["core.superadmin"],
      })
    );
    const res = await postImpersonate(app, { user_id: callerId });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "cannot impersonate yourself",
    });
  });

  it("requires user_id", async () => {
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        roleProfiles: ["core.superadmin"],
      })
    );
    const res = await postImpersonate(app, {});
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target user is missing", async () => {
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        roleProfiles: ["core.superadmin"],
      }),
      {
        lookupAuthUser: async () => null,
      }
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(404);
  });

  it("mints a session for a platform superadmin", async () => {
    const callerId = `user-${uuidv7()}`;
    const app = createApp(
      principal({
        capabilities: [IMPERSONATE_SUPERADMIN_CAPABILITY, "*"],
        principalId: callerId,
        roleProfiles: ["core.superadmin"],
      }),
      {
        lookupAuthUser: async (_admin, userId) => {
          if (userId === callerId) {
            return {
              id: callerId,
              email: "admin@example.com",
              display_name: "Admin",
            };
          }
          return {
            id: userId,
            email: "member@example.com",
            display_name: "Member",
          };
        },
        mintSession: async () => ({
          access_token: "minted-access",
          refresh_token: "minted-refresh",
        }),
      }
    );
    const res = await postImpersonate(app, { user_id: targetId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      access_token: "minted-access",
      refresh_token: "minted-refresh",
      target: {
        id: targetId,
        email: "member@example.com",
        display_name: "Member",
      },
      actor: {
        id: callerId,
        email: "admin@example.com",
        display_name: "Admin",
      },
    });
  });
});
