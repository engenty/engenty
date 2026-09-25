import { afterEach, describe, expect, it } from "vitest";
import { makeEmptyRegistry } from "../plugins/test-fixtures.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

const originalDevPass = process.env.ENGENTY_DEV_PASS;

function makeApp(devPass: string) {
  process.env.ENGENTY_DEV_PASS = devPass;
  return createApiApp({
    registry: makeEmptyRegistry(),
    config: { engentyDevPass: devPass },
    dataDir: "/tmp",
    resolvePath: (p: string) => p,
    auditLog: createNoopAuditLog(),
  });
}

describe("dev-login routes", () => {
  afterEach(() => {
    if (originalDevPass === undefined) {
      delete process.env.ENGENTY_DEV_PASS;
    } else {
      process.env.ENGENTY_DEV_PASS = originalDevPass;
    }
  });

  it("returns 404 when ENGENTY_DEV_PASS is not set", async () => {
    const res = await makeApp("").request("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "admin" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 401 when password does not match dev password", async () => {
    const res = await makeApp("correct-dev-pass").request(
      "/api/auth/dev-login",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrong-pass",
        }),
      }
    );
    expect(res.status).toBe(401);
  });

  describe("local-host gating", () => {
    it("session endpoint is 404 on a deployed host even with dev pass set", async () => {
      const res = await makeApp("admin").request(
        "https://app.engenty.com/api/auth/dev-login/session"
      );
      expect(res.status).toBe(404);
    });

    it("rejects a local Host when X-Forwarded-Host is a deployed domain", async () => {
      const res = await makeApp("admin").request(
        "http://localhost/api/auth/dev-login/session",
        { headers: { "x-forwarded-host": "app.engenty.com" } }
      );
      expect(res.status).toBe(404);
    });
  });
});
