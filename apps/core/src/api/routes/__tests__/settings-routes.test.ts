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

    it("returns env vars when superadmin", async () => {
      const token = await signToken(["core.superadmin"]);
      const app = createApp();
      const res = await app.request("/api/settings/env", {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        data: { vars: Array<{ key: string; value: string; masked: boolean }> };
        ok: true;
      };
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data.vars)).toBe(true);
      expect(body.data.vars.every((v) => typeof v.key === "string")).toBe(true);
      expect(body.data.vars.every((v) => typeof v.masked === "boolean")).toBe(
        true
      );
    });

    it("lists FIRECRAWL_API_KEY as missing when not set", async () => {
      const prevKey = process.env.FIRECRAWL_API_KEY;
      const prevUrl = process.env.FIRECRAWL_API_URL;
      delete process.env.FIRECRAWL_API_KEY;
      delete process.env.FIRECRAWL_API_URL;
      try {
        const token = await signToken(["core.superadmin"]);
        const app = createApp();
        const res = await app.request("/api/settings/env", {
          headers: { authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          data: { vars: Array<{ key: string; missing?: boolean }> };
        };
        const fc = body.data.vars.find((v) => v.key === "FIRECRAWL_API_KEY");
        expect(fc?.missing).toBe(true);
        const urlRow = body.data.vars.find(
          (v) => v.key === "FIRECRAWL_API_URL"
        );
        expect(urlRow?.missing).toBe(true);
      } finally {
        if (prevKey === undefined) {
          delete process.env.FIRECRAWL_API_KEY;
        } else {
          process.env.FIRECRAWL_API_KEY = prevKey;
        }
        if (prevUrl === undefined) {
          delete process.env.FIRECRAWL_API_URL;
        } else {
          process.env.FIRECRAWL_API_URL = prevUrl;
        }
      }
    });
  });
});
