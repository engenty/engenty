import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import type { TenantPluginOverridesDal } from "../dal/tenant-plugin-overrides.js";
import { loadPlugins } from "../plugins/loader.js";
import { createNoopAuditLog } from "../security/audit-adapter.js";
import { createApiApp } from "./server.js";

async function createToken(
  secret: string,
  params: { capabilities: string[] }
): Promise<string> {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "user",
    capabilities: params.capabilities,
    role_profiles: [],
    module_ids: [],
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret));
}

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-plugin-http-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeUserSettingsPlugin(dir: string) {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@engenty/user-settings",
      version: "0.0.1",
      engenty: { extensions: ["./index.js"] },
      dependencies: {
        "@engenty/plugin-sdk": "workspace:*",
      },
    })
  );
  fs.writeFileSync(
    path.join(dir, "engenty.plugin.json"),
    JSON.stringify({
      id: "user-settings",
      name: "User Settings",
      version: "0.0.1",
      server: { entry: "./index.js" },
    })
  );
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `
      export default function registerUserSettings(engenty) {
        engenty.server.registerHttpRoute({
          method: "get",
          path: "/api/user-settings/:name",
          operation: {
            operationId: "user_settings_get",
            requiredCapabilities: ["user-settings.read"],
            riskLevel: "low",
            idempotent: true,
          },
          responses: {
            200: { description: "ok" },
          },
          handler: async (ctx) => ({
            name: ctx.params.name,
            spaceId: ctx.auth?.spaceId ?? null,
            type: "json",
            value_jsonb: { ok: true },
          }),
        });
      }
    `
  );
}

function createTenantPluginOverrides(
  overrides: Record<string, boolean>
): TenantPluginOverridesDal {
  return {
    getOverrides: async () => overrides,
    setOverride: async (_tenantId, pluginId, enabled) => {
      overrides[pluginId] = enabled;
    },
  };
}

describe("plugin HTTP routes", () => {
  let tmpRoot = "";

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("invokes package plugin routes when only the plugin SDK is an Engenty dependency", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(packagesDir, "user-settings");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
    writeUserSettingsPlugin(pluginDir);

    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const userSettings = registry.plugins.find(
      (plugin) => plugin.id === "user-settings"
    );
    expect(userSettings).toMatchObject({
      loaded: true,
      dependencies: [],
    });

    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["user-settings.read"],
    });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: tmpRoot,
      resolvePath: (p) => path.resolve(tmpRoot, p),
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });

    const response = await app.request("/api/user-settings/copilot.layout", {
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        name: "copilot.layout",
        spaceId: null,
        value_jsonb: { ok: true },
      },
    });
  });

  it("forwards x-engenty-space-id onto the handler auth (scope=space lists)", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(packagesDir, "user-settings");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(pluginDir, { recursive: true });
    writeUserSettingsPlugin(pluginDir);

    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });
    const secret = "test-security-secret";
    const token = await createToken(secret, {
      capabilities: ["user-settings.read"],
    });
    const app = createApiApp({
      registry,
      config: { securityJwtSecret: secret },
      dataDir: tmpRoot,
      resolvePath: (p) => path.resolve(tmpRoot, p),
      auditLog: createNoopAuditLog(),
      tenantPluginOverrides: createTenantPluginOverrides({}),
    });
    const spaceId = "01a0aa05-e37c-736a-af16-ea36e3c133ff";

    const response = await app.request("/api/user-settings/copilot.layout", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-engenty-space-id": spaceId,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        name: "copilot.layout",
        spaceId,
      },
    });
  });
});
