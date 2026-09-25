import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { registerDispatchRoutes } from "../api/dispatch-routes.js";

describe("GET /ai/v1/dispatch/status", () => {
  it("returns 403 for a tenant member", async () => {
    // The platform-wide queue is gated on core.ai.dispatch, which `module.*` does not cover.
    const app = new Hono();
    registerDispatchRoutes(app, {
      getQueue: () => null,
      scopeResolver: async () => ({
        ok: true as const,
        scope: {
          tenantId: "tenant-1",
          userId: "user-1",
          capabilities: ["module.*", "tenant-settings.read"],
          isSuperAdmin: false,
          isTenantAdmin: false,
          tenantRole: "member" as const,
          credential: { kind: "user" as const, token: "token" },
        },
      }),
    });

    const res = await app.request("/ai/v1/dispatch/status");

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe(
      "dispatch.forbidden"
    );
  });
});
