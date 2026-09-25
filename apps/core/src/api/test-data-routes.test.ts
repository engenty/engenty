import {
  createApprovalService,
  createFakeApprovalDb,
} from "@engenty/approvals-sdk";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { registerTestDataRoutes } from "./routes/test-data-routes.js";

// These routes ship in production and write records into any tenant.
function createApp() {
  const app = new OpenAPIHono();
  registerTestDataRoutes({
    app,
    approvalService: createApprovalService(createFakeApprovalDb().client),
    auditLog: createNoopAuditLog(),
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    dataDir: "/tmp",
    getLogger: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
    registry: makeEmptyRegistry(),
    resolvePath: (p) => p,
  });
  return app;
}

describe("test data routes", () => {
  it("returns 401 without auth", async () => {
    const app = createApp();
    const response = await app.request("/api/test-data/types");
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-superadmin", async () => {
    const token = await new SignJWT({
      tenant_id: "tenant-1",
      role: "user",
      token_type: "access",
      auth_method: "oauth",
      capabilities: ["module.read"],
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode("test-secret"));

    const app = createApp();
    const response = await app.request("/api/test-data/types", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});
