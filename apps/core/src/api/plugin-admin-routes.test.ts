import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listActiveAiRegistrations,
  registerAiRegistration,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { PluginRecord, PluginRegistry } from "../plugins/registry.js";
import { registerPluginAdminRoutes } from "./routes/plugins/plugin-admin-routes.js";

// Keep the package-manager and reload executors from touching the workspace.
vi.mock("../plugins/reload-executor.js", () => ({
  reloadBackendPlugin: vi.fn(),
}));

vi.mock("../plugins/package-lifecycle-executor.js", () => ({
  executePluginPackageLifecycle: vi.fn(),
}));

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-plugin-admin-"));

function pluginRecord(
  overrides: Partial<PluginRecord> & { id: string }
): PluginRecord {
  return {
    name: overrides.id,
    version: "1.0.0",
    sourceType: "package",
    rootDir: path.resolve("modules", overrides.id),
    source: path.resolve("modules", overrides.id, "src/plugin.ts"),
    manifestPath: path.resolve("modules", overrides.id, "engenty.plugin.json"),
    kind: "module",
    enabled: true,
    loaded: true,
    dependencies: [],
    cliCommands: [],
    featureFlags: [],
    services: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    queues: [],
    testDataTypes: [],
    ...overrides,
  };
}

function createRegistry(): PluginRegistry {
  return {
    aiRegistrations: [],
    plugins: [
      pluginRecord({ id: "contacts", provides: ["module.contacts"] }),
      pluginRecord({ id: "leads", requires: ["module.contacts"] }),
      pluginRecord({
        id: "engenty-copilot",
        sourceType: "module",
        provides: ["module.engenty-copilot", "platform.copilot"],
      }),
    ],
    cliRegistrars: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
    diagnostics: [],
    featureFlags: [],
  };
}

function createApp(registry: PluginRegistry = createRegistry()) {
  const app = new OpenAPIHono();
  const overrides: Record<string, boolean> = {};
  registerPluginAdminRoutes({
    auditLog: { push: () => undefined } as never,
    app,
    registry,
    dataDir,
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    resolvePath: (item) => path.resolve(dataDir, item),
    tenantPluginOverrides: {
      getOverrides: async () => overrides,
      setOverride: async (_tenantId, pluginId, enabled) => {
        overrides[pluginId] = enabled;
      },
    },
  });
  return { app, overrides, registry };
}

async function signCapabilityToken(capabilities: string[]) {
  return await new SignJWT({
    tenant_id: "tenant-1",
    role: "service",
    token_type: "access",
    auth_method: "oauth",
    capabilities,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("service-admin")
    .setIssuedAt()
    .setIssuer("engenty-core")
    .setAudience("engenty")
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode("test-secret"));
}

async function post(app: OpenAPIHono, url: string, token: string, body = {}) {
  return await app.request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe("plugin admin routes", () => {
  afterEach(() => {
    unregisterAiRegistration("contacts");
  });

  afterAll(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("refuses runtime UI assets that resolve outside the plugin root", async () => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "engenty-ui-"));
    const rootDir = path.join(workDir, "plugin");
    fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "dist", "plugin.js"), "export {};\n");
    fs.writeFileSync(path.join(workDir, "outside.css"), ".secret {}\n");
    const registry = createRegistry();
    registry.plugins.push(
      pluginRecord({
        id: "hello-world",
        rootDir,
        ui: {
          entry: "./dist/plugin.js",
          staticAssets: ["../outside.css"],
          assetOrigins: ["self"],
        },
        capabilities: { ui: true },
      })
    );
    const { app } = createApp(registry);

    try {
      const response = await app.request(
        "/api/plugins/hello-world/ui/assets/0/outside.css"
      );
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(".secret");
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  it("rejects missing token", async () => {
    const { app } = createApp();

    const response = await app.request("/api/plugins");

    expect(response.status).toBe(401);
  });

  it("blocks deactivation of mandatory plugins", async () => {
    const { app, registry } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await post(
      app,
      "/api/plugins/engenty-copilot/deactivate",
      token
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("plugin.mandatory.deactivation_blocked");
    expect(
      registry.plugins.find((plugin) => plugin.id === "engenty-copilot")
        ?.enabled
    ).toBe(true);
  });

  it("blocks tenant activation when a required dependency is tenant-disabled", async () => {
    const { app, overrides } = createApp();
    overrides.contacts = false;
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await post(app, "/api/plugins/leads/activate", token, {
      tenant_id: "tenant-1",
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; details?: { blockedReasons?: string[] } };
    };
    expect(body.error.code).toBe("plugin.tenant_activation.blocked");
    expect(body.error.details?.blockedReasons).toContain("dependency_disabled");
    expect(overrides.leads).toBeUndefined();
  });

  it("unregisters AI registrations when deactivating a plugin", async () => {
    registerAiRegistration({
      module_id: "contacts",
      workflows: [],
      instruction_documents: [],
      skills: [],
      triggers: [
        {
          id: "contacts_enhance_trigger",
          moduleId: "contacts",
          routeKey: "enhance",
          triggerType: "button",
        },
      ],
    });
    const { app } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await post(app, "/api/plugins/contacts/deactivate", token);

    expect(response.status).toBe(200);
    expect(
      listActiveAiRegistrations().some(
        (registration) => registration.module_id === "contacts"
      )
    ).toBe(false);
  });

  it("blocks non-superadmin package uninstall execution", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await post(app, "/api/plugins/leads/uninstall", token);

    expect(response.status).toBe(403);
  });

  it("blocks non-superadmin reload execution", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await post(app, "/api/plugins/leads/reload", token);

    expect(response.status).toBe(403);
  });
});
