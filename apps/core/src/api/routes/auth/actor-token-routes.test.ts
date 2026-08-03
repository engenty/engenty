// AUTH-01 regression: minting an actor token is a member→admin privilege
// climb unless the capability check looks at the caller's WHOLE held set.
//
// The bug was `caller.capabilities.some((held) => capabilityCovers(held, …))`.
// `capabilityCovers` expects `string[]` and starts with `granted.includes("*")`;
// handed a single string that becomes a SUBSTRING test, so any held capability
// containing an asterisk passed. Every `tenant.member` holds `module.*`.

import { capabilityCovers } from "@engenty/plugin-sdk";
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

describe("capabilityCovers — the matcher AUTH-01 misused", () => {
  it("does not let module.* cover core.users.impersonate", () => {
    expect(capabilityCovers(["module.*"], ACTOR_TOKEN_CAPABILITY)).toBe(false);
  });

  it("covers it for the sets that are meant to", () => {
    for (const granted of [
      ["core.users.impersonate"],
      ["core.*"],
      ["*"],
      ["core.superadmin"],
    ]) {
      expect(capabilityCovers(granted, ACTOR_TOKEN_CAPABILITY)).toBe(true);
    }
  });

  it("rejects the scalar form at compile time", () => {
    // The regression guard: passing a single capability string is the bug.
    // Reintroduce the per-element `.some(...)` shape and the directive below
    // goes unused, which is itself a typecheck failure.
    // @ts-expect-error capabilityCovers takes the whole granted set, never one entry
    const wrong = capabilityCovers("module.*", ACTOR_TOKEN_CAPABILITY);
    // …and it is precisely because the scalar form *works at runtime* — the
    // substring test says yes — that it had to be a type error to be caught.
    expect(wrong).toBe(true);
  });
});

describe("POST /api/auth/actor-token — authorization", () => {
  const tenantId = "tenant-fixed";
  const target = `user-${uuidv7()}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a tenant member holding module.* (AUTH-01)", async () => {
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

  it.each([
    ["core.users.impersonate"],
    ["core.*"],
    ["*"],
  ])("allows a caller holding %s", async (capability) => {
    const app = createApp(principal({ capabilities: [capability], tenantId }));
    const res = await mint(app, { tenant_id: tenantId, user_id: target });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { expires_in: number; token: string };
    expect(body.expires_in).toBe(300);

    // The token is the target's, not the caller's.
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
