import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { registerSettingsReloadRoutes } from "../settings-reload-routes.js";

const TENANT = "00000000-0000-4000-8000-00000000000a";
const USER = "00000000-0000-4000-8000-00000000000c";

function resolver(scope: {
  credentialKind: "user" | "service";
  isSuperAdmin: boolean;
}) {
  return async () => ({
    ok: true as const,
    scope: {
      capabilities: ["*"],
      credential: { kind: scope.credentialKind, token: "tok" },
      isSuperAdmin: scope.isSuperAdmin,
      isTenantAdmin: true,
      tenantId: TENANT,
      tenantRole: "admin" as const,
      userId: USER,
    },
  });
}

function build(scope: Parameters<typeof resolver>[0]) {
  const app = new Hono();
  const reload = vi.fn(async () => ({
    cleared: ["OPENROUTER_API_KEY"],
    hydrated: ["AI_GATEWAY_API_KEY"],
  }));
  registerSettingsReloadRoutes(app, {
    bootOnlyKeys: () => ["LANGFUSE_SECRET_KEY"],
    reload,
    scopeResolver: resolver(scope),
  });
  return { app, reload };
}

describe("POST /ai/internal/settings/reload", () => {
  it("re-hydrates for core's service principal", async () => {
    const { app, reload } = build({
      credentialKind: "service",
      isSuperAdmin: false,
    });
    const response = await app.request("/ai/internal/settings/reload", {
      headers: { authorization: "Bearer tok" },
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      bootOnly: ["LANGFUSE_SECRET_KEY"],
      cleared: ["OPENROUTER_API_KEY"],
      hydrated: ["AI_GATEWAY_API_KEY"],
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("re-hydrates for a platform superadmin", async () => {
    const { app } = build({ credentialKind: "user", isSuperAdmin: true });
    const response = await app.request("/ai/internal/settings/reload", {
      headers: { authorization: "Bearer tok" },
      method: "POST",
    });
    expect(response.status).toBe(200);
  });

  it("refuses a tenant admin, whose `*` would otherwise pass a capability check", async () => {
    const { app, reload } = build({
      credentialKind: "user",
      isSuperAdmin: false,
    });
    const response = await app.request("/ai/internal/settings/reload", {
      headers: { authorization: "Bearer tok" },
      method: "POST",
    });
    expect(response.status).toBe(403);
    expect(reload).not.toHaveBeenCalled();
  });
});
