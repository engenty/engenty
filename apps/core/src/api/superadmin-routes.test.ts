import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { registerSuperadminRoutes } from "./routes/superadmin-routes.js";

async function signToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

describe("superadmin routes", () => {
  it("rejects missing token", async () => {
    const app = new OpenAPIHono();
    registerSuperadminRoutes({
      app,
      config: {
        securityJwtSecret: "test-secret",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseServiceRoleKey: "test-service-role",
      },
    });

    const response = await app.request("/api/superadmin/tenants");
    expect(response.status).toBe(401);
  });

  it("rejects token without superadmin capability", async () => {
    const app = new OpenAPIHono();
    registerSuperadminRoutes({
      app,
      config: {
        securityJwtSecret: "test-secret",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseServiceRoleKey: "test-service-role",
      },
    });
    const token = await signToken(["core.users.manage"]);
    const response = await app.request("/api/superadmin/tenants", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(403);
  });
});
