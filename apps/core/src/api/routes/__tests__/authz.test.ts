import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { registerAuthzRoutes } from "../authz-routes.js";

async function signToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "user",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("user-1")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

describe("route authz", () => {
  it("does not let a tenant admin's `*` grant reach another tenant", async () => {
    // Tenant admins resolve to `*`; only `core.superadmin` may cross tenants.
    const app = new OpenAPIHono();
    registerAuthzRoutes({
      app,
      config: { securityJwtSecret: "test-secret" },
      grants: {} as never,
      registry: {} as never,
    });

    const response = await app.request(
      "/api/tenants/tenant-2/role-assignments",
      { headers: { authorization: `Bearer ${await signToken(["*"])}` } }
    );

    expect(response.status).toBe(403);
  });
});
