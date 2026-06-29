import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  CORE_AI_REMOVED_FROM_CORE_MESSAGE,
  registerCoreAiRemovedRoutes,
} from "../core-ai-removed-routes.js";

async function signToken() {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities: ["module.read"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-user")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

describe("core AI removed routes", () => {
  it("returns 404 for legacy admin and runtime AI paths", async () => {
    const app = new OpenAPIHono();
    registerCoreAiRemovedRoutes(app);
    const token = await signToken();

    for (const path of [
      "/api/admin/ai/agents",
      "/api/admin/ai/instructions",
      "/api/ai/triggers",
      "/api/ai/sessions",
    ]) {
      const response = await app.request(path, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.status).toBe(404);
      const body = (await response.json()) as { error?: { message?: string } };
      expect(body.error?.message).toBe(CORE_AI_REMOVED_FROM_CORE_MESSAGE);
    }
  });
});
