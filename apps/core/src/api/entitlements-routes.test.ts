import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { PackagesDal } from "../dal/packages.js";
import { entitlements } from "../lib/entitlements-runtime.js";
import { registerEntitlementsRoutes } from "./routes/entitlements-routes.js";

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

describe.skipIf(!entitlements)("entitlements routes", () => {
  it("gates the catalog behind superadmin", async () => {
    const app = new OpenAPIHono();
    registerEntitlementsRoutes({
      app,
      config: {
        securityJwtSecret: "test-secret",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseServiceRoleKey: "test-service-role",
      },
      createDal: () => ({}) as PackagesDal,
    });
    const nonAdmin = await signToken(["core.plugins.manage"]);
    const res = await app.request("/api/superadmin/packages", {
      headers: { authorization: `Bearer ${nonAdmin}` },
    });
    expect(res.status).toBe(403);
  });
});
