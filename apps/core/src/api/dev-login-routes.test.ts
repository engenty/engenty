import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugins/registry.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

function makeEmptyRegistry(): PluginRegistry {
  return {
    plugins: [],
    cliRegistrars: [],
    diagnostics: [],
    services: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
  };
}

describe("dev-login routes", () => {
  it("returns 404 when ENGENTY_DEV_PASS is not set", async () => {
    const original = process.env.ENGENTY_DEV_PASS;
    process.env.ENGENTY_DEV_PASS = "";
    try {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const res = await app.request("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "admin" }),
      });
      expect(res.status).toBe(404);
    } finally {
      if (original === undefined) {
        delete process.env.ENGENTY_DEV_PASS;
      } else {
        process.env.ENGENTY_DEV_PASS = original;
      }
    }
  });

  it("returns available=false from status when dev pass is not configured", async () => {
    const original = process.env.ENGENTY_DEV_PASS;
    process.env.ENGENTY_DEV_PASS = "";
    try {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const res = await app.request("/api/auth/dev-login/status");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(false);
    } finally {
      if (original === undefined) {
        delete process.env.ENGENTY_DEV_PASS;
      } else {
        process.env.ENGENTY_DEV_PASS = original;
      }
    }
  });

  it("returns available=true and defaultEmail from status when configured", async () => {
    const app = createApiApp({
      registry: makeEmptyRegistry(),
      config: {
        engentyDevPass: "admin",
        engentyDevEmail: "agent@engenty.local",
      },
      dataDir: "/tmp",
      resolvePath: (p: string) => p,
      auditLog: createNoopAuditLog(),
    });

    const res = await app.request("/api/auth/dev-login/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      defaultEmail?: string;
    };
    expect(body.available).toBe(true);
    expect(body.defaultEmail).toBe("agent@engenty.local");
  });

  it("returns 401 when password does not match dev password", async () => {
    const original = process.env.ENGENTY_DEV_PASS;
    process.env.ENGENTY_DEV_PASS = "correct-dev-pass";
    try {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "correct-dev-pass" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const res = await app.request("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "wrong-pass",
        }),
      });
      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Invalid dev password");
    } finally {
      if (original === undefined) {
        process.env.ENGENTY_DEV_PASS = undefined;
      } else {
        process.env.ENGENTY_DEV_PASS = original;
      }
    }
  });

  it("returns 400 when email is missing", async () => {
    const original = process.env.ENGENTY_DEV_PASS;
    process.env.ENGENTY_DEV_PASS = "admin";
    try {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "admin" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const res = await app.request("/api/auth/dev-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: "admin" }),
      });
      expect(res.status).toBe(400);
    } finally {
      if (original === undefined) {
        process.env.ENGENTY_DEV_PASS = undefined;
      } else {
        process.env.ENGENTY_DEV_PASS = original;
      }
    }
  });

  it("session endpoint returns 404 when ENGENTY_DEV_PASS is not set", async () => {
    const original = process.env.ENGENTY_DEV_PASS;
    process.env.ENGENTY_DEV_PASS = "";
    try {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const res = await app.request("/api/auth/dev-login/session");
      expect(res.status).toBe(404);
    } finally {
      if (original === undefined) {
        delete process.env.ENGENTY_DEV_PASS;
      } else {
        process.env.ENGENTY_DEV_PASS = original;
      }
    }
  });

  describe("local-host gating", () => {
    function makeApp() {
      return createApiApp({
        registry: makeEmptyRegistry(),
        config: { engentyDevPass: "admin" },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });
    }

    it("status reports available on the portless gateway host", async () => {
      const res = await makeApp().request(
        "https://engenty.localhost/api/auth/dev-login/status"
      );
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(true);
    });

    it("status reports unavailable on a deployed host even with dev pass set", async () => {
      const res = await makeApp().request(
        "https://app.engenty.com/api/auth/dev-login/status"
      );
      const body = (await res.json()) as { available: boolean };
      expect(body.available).toBe(false);
    });

    it("session endpoint is 404 on a deployed host even with dev pass set", async () => {
      const res = await makeApp().request(
        "https://app.engenty.com/api/auth/dev-login/session"
      );
      expect(res.status).toBe(404);
    });

    it("rejects a local Host when X-Forwarded-Host is a deployed domain", async () => {
      const res = await makeApp().request(
        "http://localhost/api/auth/dev-login/session",
        { headers: { "x-forwarded-host": "app.engenty.com" } }
      );
      expect(res.status).toBe(404);
    });

    it("ENGENTY_DEV_PASS_BASE_URL widens the allowed host", async () => {
      const app = createApiApp({
        registry: makeEmptyRegistry(),
        config: {
          engentyDevPass: "admin",
          engentyDevPassBaseUrl: "https://dev.example.test",
        },
        dataDir: "/tmp",
        resolvePath: (p: string) => p,
        auditLog: createNoopAuditLog(),
      });

      const allowedRes = await app.request(
        "https://dev.example.test/api/auth/dev-login/status"
      );
      const allowed = (await allowedRes.json()) as { available: boolean };
      expect(allowed.available).toBe(true);

      const blockedRes = await app.request(
        "https://app.engenty.com/api/auth/dev-login/status"
      );
      const blocked = (await blockedRes.json()) as { available: boolean };
      expect(blocked.available).toBe(false);
    });
  });
});
