import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../../../../plugins/registry.js";
import { createNoopAuditLog } from "../../../../security/audit-adapter.js";
import { createApiApp } from "../../../server.js";
import { CORE_DASHBOARD_AI_REMOVED_MESSAGE } from "../../core-ai-removed-routes.js";

function makeRegistry(): PluginRegistry {
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

async function createApiToken(secret: string): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    capabilities: ["*"],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("service-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

describe("dashboard-routes", () => {
  it("returns 503 for widget generate after core AI removal", async () => {
    const securityJwtSecret = "test-secret";
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });
    const token = await createApiToken(securityJwtSecret);

    const res = await app.request("/api/dashboard/widgets/generate", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: "Show revenue",
        tenantId: "tenant-1",
      }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe(CORE_DASHBOARD_AI_REMOVED_MESSAGE);
  });

  it("returns 503 for widget runtime after core AI removal", async () => {
    const securityJwtSecret = "test-secret";
    const app = createApiApp({
      registry: makeRegistry(),
      config: { securityJwtSecret },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });
    const token = await createApiToken(securityJwtSecret);

    const res = await app.request("/api/dashboard/widgets/runtime", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        widgetId: "w-1",
        tenantId: "tenant-1",
      }),
    });

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: { message?: string } };
    expect(body.error?.message).toBe(CORE_DASHBOARD_AI_REMOVED_MESSAGE);
  });
});
