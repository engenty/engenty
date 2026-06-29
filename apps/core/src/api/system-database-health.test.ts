import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it, vi } from "vitest";
import type { CoreUsersDal } from "../dal/core-users.js";
import { registerSystemDatabaseHealthRoute } from "./routes/system/register-database-health-route.js";

function stubDal(overrides: Partial<CoreUsersDal> = {}): CoreUsersDal {
  return {
    getSetupStatus: vi.fn(async () => ({
      initialSetupRequired: false,
      usersCount: 1,
    })),
    ...overrides,
  } as CoreUsersDal;
}

describe("GET /api/system/database-health", () => {
  it("returns 200 when database responds", async () => {
    const app = new OpenAPIHono();
    registerSystemDatabaseHealthRoute({
      app,
      config: { securityJwtSecret: "test-secret" },
      getDal: () => stubDal(),
    });
    const res = await app.request("/api/system/database-health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: unknown };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ database_reachable: true });
  });

  it("returns 503 when getSetupStatus throws a connectivity-shaped error", async () => {
    const app = new OpenAPIHono();
    registerSystemDatabaseHealthRoute({
      app,
      config: { securityJwtSecret: "test-secret" },
      getDal: () =>
        stubDal({
          getSetupStatus: vi.fn(async () => {
            throw new TypeError("fetch failed");
          }),
        }),
    });
    const res = await app.request("/api/system/database-health");
    expect(res.status).toBe(503);
    const body = (await res.json()) as {
      ok: false;
      error: { code: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("50001");
  });
});
