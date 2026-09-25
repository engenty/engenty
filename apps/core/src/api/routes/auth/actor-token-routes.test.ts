// Minting an actor token is impersonation: the caller's WHOLE held set must cover
// the capability, or a member holding `module.*` climbs to admin.

import { OpenAPIHono } from "@hono/zod-openapi";
import { uuidv7 } from "uuidv7";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNoopAuditLog } from "../../../security/audit-adapter.js";
import type { PrincipalContext } from "../../../security/auth.js";
import { verifyAccessToken } from "../../../security/auth.js";
import type { AuthProvider } from "../../../security/auth-provider.js";
import type { GrantsService } from "../../../security/grants-service.js";
import {
  ACTOR_TOKEN_CAPABILITY,
  registerActorTokenRoutes,
} from "./actor-token-routes.js";

const TEST_SECRET = "test-jwt-secret-for-actor-token-routes";

// The route's membership lookup is the only Supabase read; every user in these
// tests is an admin of the tenant, which is exactly the target worth stealing.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { role: "admin" }, error: null }),
            }),
          }),
        }),
      }),
    }),
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

function createApp(caller: PrincipalContext) {
  const app = new OpenAPIHono();
  const authProvider = {
    resolveAdminFallback: () => Promise.resolve(caller),
    resolvePrincipal: () => Promise.resolve(caller),
    resolveTenantForSession: () => Promise.resolve(caller.tenantId),
    verifyToken: () => Promise.resolve(caller),
  } as unknown as AuthProvider;
  const grants = {
    invalidate: () => undefined,
    // The minted token carries the TARGET's grants — a tenant admin's `*`.
    resolveGrants: () =>
      Promise.resolve({ capabilities: ["*"], roleProfiles: ["tenant.admin"] }),
  } as unknown as GrantsService;

  registerActorTokenRoutes({
    app,
    auditLog: createNoopAuditLog(),
    authProvider,
    config: {
      securityJwtSecret: TEST_SECRET,
      supabaseServiceRoleKey: "test-service-role-key",
      supabaseUrl: "http://127.0.0.1:54321",
    },
    grants,
  });
  return app;
}

async function mint(
  app: OpenAPIHono,
  body: Record<string, unknown>
): Promise<Response> {
  return await app.request("/api/auth/actor-token", {
    body: JSON.stringify(body),
    headers: {
      authorization: "Bearer whatever-the-provider-is-stubbed",
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/auth/actor-token — authorization", () => {
  const tenantId = "tenant-fixed";
  const target = `user-${uuidv7()}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a tenant member holding module.*", async () => {
    const app = createApp(
      principal({
        capabilities: [
          "module.*",
          "tenant-settings.read",
          "tenant-settings.write",
          "user-settings.read",
          "user-settings.write",
        ],
        tenantId,
      })
    );
    const res = await mint(app, { tenant_id: tenantId, user_id: target });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });

  it("mints the target's token for a caller holding core.users.impersonate", async () => {
    const app = createApp(
      principal({ capabilities: [ACTOR_TOKEN_CAPABILITY], tenantId })
    );
    const res = await mint(app, { tenant_id: tenantId, user_id: target });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expires_in: number; token: string };
    expect(body.expires_in).toBe(300);

    const minted = await verifyAccessToken(
      `Bearer ${body.token}`,
      TEST_SECRET,
      { transport: "rest" }
    );
    expect(minted?.principalId).toBe(target);
    expect(minted?.principalType).toBe("user");
    expect(minted?.capabilities).toEqual(["*"]);
  });

  it("still refuses cross-tenant minting", async () => {
    const app = createApp(principal({ capabilities: ["*"], tenantId }));
    const res = await mint(app, {
      tenant_id: `tenant-${uuidv7()}`,
      user_id: target,
    });
    expect(res.status).toBe(403);
  });

  it("rate-limits a caller grinding the route", async () => {
    // 60/min per (caller, source ip); the 61st is refused. Minting an
    // impersonation token deserves the same ceiling as a secret exchange.
    const caller = principal({ capabilities: ["*"], tenantId });
    const app = createApp(caller);
    let lastStatus = 0;
    for (let attempt = 0; attempt < 61; attempt++) {
      const res = await mint(app, { tenant_id: tenantId, user_id: target });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
