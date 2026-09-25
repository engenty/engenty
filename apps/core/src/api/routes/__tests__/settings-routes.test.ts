import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { registerSettingsRoutes } from "../settings-routes.js";

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

function createApp() {
  const app = new OpenAPIHono();
  registerSettingsRoutes({
    app,
    config: { securityJwtSecret: "test-secret" },
  });
  return app;
}

describe("settings routes", () => {
  describe("GET /api/settings/env", () => {
    it("returns 401 without authorization", async () => {
      const app = createApp();
      const res = await app.request("/api/settings/env");
      expect(res.status).toBe(401);
    });

    it("returns 403 when not superadmin", async () => {
      const token = await signToken(["module.read"]);
      const app = createApp();
      const res = await app.request("/api/settings/env", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
    });

    it("masks secret-looking values for superadmin", async () => {
      const previous = process.env.TEST_SERVICE_KEY;
      process.env.TEST_SERVICE_KEY = "supersecretvalue123";
      try {
        const token = await signToken(["core.superadmin"]);
        const res = await createApp().request("/api/settings/env", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          data: {
            vars: Array<{ key: string; masked: boolean; value: string }>;
          };
        };
        const row = body.data.vars.find((v) => v.key === "TEST_SERVICE_KEY");
        expect(row?.masked).toBe(true);
        expect(row?.value).not.toContain("supersecretvalue123");
      } finally {
        if (previous === undefined) {
          delete process.env.TEST_SERVICE_KEY;
        } else {
          process.env.TEST_SERVICE_KEY = previous;
        }
      }
    });
  });
});
