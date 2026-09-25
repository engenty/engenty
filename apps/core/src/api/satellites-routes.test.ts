import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import type { SatellitesDal } from "../dal/satellites.js";
import { registerSatellitesRoutes } from "./routes/satellites-routes.js";

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

describe("satellites routes", () => {
  it("gates the registry behind superadmin", async () => {
    const app = new OpenAPIHono();
    registerSatellitesRoutes({
      app,
      config: {
        securityJwtSecret: "test-secret",
        supabaseUrl: "http://127.0.0.1:54321",
        supabaseServiceRoleKey: "test-service-role",
      },
      createDal: () =>
        ({ listSatellites: async () => [] }) as unknown as SatellitesDal,
    });
    const nonAdmin = await signToken(["core.plugins.manage"]);
    const res = await app.request("/api/superadmin/satellites", {
      headers: { authorization: `Bearer ${nonAdmin}` },
    });
    expect(res.status).toBe(403);
  });
});
