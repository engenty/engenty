import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPluginEventsRuntime } from "@engenty/plugin-sdk";
import { OpenAPIHono } from "@hono/zod-openapi";
import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executePluginPackageLifecycle } from "../plugins/package-lifecycle-executor.js";
import type { PluginRegistry } from "../plugins/registry.js";
import { reloadBackendPlugin } from "../plugins/reload-executor.js";
import { registerPluginAdminRoutes } from "./routes/plugins/plugin-admin-routes.js";

vi.mock("../plugins/reload-executor.js", () => ({
  reloadBackendPlugin: vi.fn(),
}));

vi.mock("../plugins/package-lifecycle-executor.js", () => ({
  executePluginPackageLifecycle: vi.fn(),
}));

function logger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function createRegistry(): PluginRegistry {
  return {
    aiRegistrations: [],
    plugins: [
      {
        id: "contacts",
        name: "Contacts",
        version: "1.0.0",
        sourceType: "package",
        rootDir: path.resolve("modules/contacts"),
        source: path.resolve("modules/contacts/src/plugin.ts"),
        packageName: "@engenty/contacts",
        manifestPath: path.resolve("modules/contacts/engenty.plugin.json"),
        kind: "module",
        enabled: true,
        loaded: true,
        dependencies: [],
        provides: ["module.contacts"],
        cliCommands: [],
        featureFlags: [],
        services: [],
        httpRoutes: [],
        gatewayMethods: [],
        moduleOperations: [],
        queues: [],
        testDataTypes: [],
      },
      {
        id: "leads",
        name: "Leads",
        description: "Example plugin",
        version: "1.0.0",
        sourceType: "package",
        rootDir: path.resolve("modules/leads"),
        source: path.resolve("modules/leads/src/plugin.ts"),
        packageName: "@engenty/leads",
        manifestPath: path.resolve("modules/leads/engenty.plugin.json"),
        kind: "module",
        ui: { entry: "index.tsx", enabled: true },
        enabled: true,
        loaded: true,
        dependencies: [],
        requires: ["module.contacts"],
        cliCommands: [],
        featureFlags: [],
        services: ["service.a"],
        httpRoutes: ["GET /api/a"],
        gatewayMethods: ["a.method"],
        moduleOperations: ["plugin-a.op"],
        queues: [],
        testDataTypes: [],
      },
      {
        id: "engenty-copilot",
        name: "Engenty Copilot",
        description: "Core AI copilot surface",
        version: "0.0.1",
        sourceType: "module",
        rootDir: path.resolve("modules/engenty-copilot"),
        source: path.resolve("modules/engenty-copilot/src/plugin.ts"),
        packageName: "@engenty/engenty-copilot",
        manifestPath: path.resolve(
          "modules/engenty-copilot/engenty.plugin.json"
        ),
        kind: "module",
        enabled: true,
        loaded: true,
        dependencies: [],
        provides: ["module.engenty-copilot", "platform.copilot"],
        cliCommands: [],
        featureFlags: [],
        services: [],
        httpRoutes: [],
        gatewayMethods: [],
        moduleOperations: [],
        queues: [],
        testDataTypes: [],
      },
    ],
    cliRegistrars: [],
    httpRoutes: [],
    gatewayMethods: [],
    moduleOperations: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
    diagnostics: [
      {
        code: "plugin.test.sample_warning",
        level: "warn",
        pluginId: "leads",
        message: "sample warning",
      },
    ],
    featureFlags: [],
  };
}

function createApp(registry: PluginRegistry = createRegistry()) {
  const app = new OpenAPIHono();
  const auditEvents: unknown[] = [];
  const overrides: Record<string, boolean> = {};
  registerPluginAdminRoutes({
    auditLog: {
      push: (event: unknown) => auditEvents.push(event),
    } as never,
    app,
    registry,
    dataDir: "/tmp/engenty-plugin-admin-tests",
    config: {
      securityJwtSecret: "test-secret",
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseServiceRoleKey: "test-service-role",
    },
    logger: logger(),
    resolvePath: (item) =>
      path.resolve("/tmp/engenty-plugin-admin-tests", item),
    tenantPluginOverrides: {
      getOverrides: async () => overrides,
      setOverride: async (_tenantId, pluginId, enabled) => {
        overrides[pluginId] = enabled;
      },
    },
  });
  return { app, auditEvents, overrides };
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

describe("plugin admin routes", () => {
  beforeEach(() => {
    vi.mocked(reloadBackendPlugin).mockReset();
    vi.mocked(executePluginPackageLifecycle).mockReset();
  });

  it("serves active runtime UI entries and static assets from the plugin root", async () => {
    const rootDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-ui-plugin-")
    );
    fs.mkdirSync(path.join(rootDir, "dist", "ui"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "ui"), { recursive: true });
    fs.writeFileSync(
      path.join(rootDir, "dist", "ui", "plugin.js"),
      "export default () => undefined;\n"
    );
    fs.writeFileSync(
      path.join(rootDir, "ui", "hello-world.css"),
      "@layer engenty.plugins { .engenty-plugin-hello-world { display: block; } }\n"
    );
    const registry = createRegistry();
    registry.plugins.push({
      id: "hello-world",
      name: "Hello World",
      version: "0.0.1",
      sourceType: "module",
      rootDir,
      source: path.join(rootDir, "src", "plugin.ts"),
      packageName: "@engenty/hello-world",
      manifestPath: path.join(rootDir, "engenty.plugin.json"),
      kind: "module",
      ui: {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: ["./ui/hello-world.css"],
        assetOrigins: ["self"],
      },
      capabilities: { ui: true },
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
    });
    const { app } = createApp(registry);

    const entryResponse = await app.request(
      "/api/plugins/hello-world/ui/plugin.js"
    );
    expect(entryResponse.status).toBe(200);
    expect(entryResponse.headers.get("content-type")).toContain(
      "application/javascript"
    );
    await expect(entryResponse.text()).resolves.toContain("export default");

    const assetResponse = await app.request(
      "/api/plugins/hello-world/ui/assets/0/hello-world.css"
    );
    expect(assetResponse.status).toBe(200);
    expect(assetResponse.headers.get("content-type")).toContain("text/css");
    await expect(assetResponse.text()).resolves.toContain(
      ".engenty-plugin-hello-world"
    );
  });

  it("allows superadmin capability token", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request("/api/plugins", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it("allows any authenticated user to list plugins", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await app.request("/api/plugins", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
  });

  it("rejects missing token", async () => {
    const { app } = createApp();

    const response = await app.request("/api/plugins", {
      headers: {},
    });

    expect(response.status).toBe(401);
  });

  it("exposes tenant effective state and blocked dependency reasons", async () => {
    const { app, overrides } = createApp();
    overrides.contacts = false;
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await app.request("/api/plugins?tenantId=tenant-1", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: Array<{
        effectiveState: {
          allowed: boolean;
          blockedReasons: string[];
          dependencies: Array<{ reason?: string; satisfied: boolean }>;
        };
        id: string;
      }>;
    };
    const pluginA = body.data.find((entry) => entry.id === "leads");
    expect(pluginA?.effectiveState.allowed).toBe(false);
    expect(pluginA?.effectiveState.blockedReasons).toContain(
      "dependency_disabled"
    );
    expect(pluginA?.effectiveState.dependencies[0]).toMatchObject({
      reason: "dependency_disabled",
      satisfied: false,
    });
  });

  it("exposes mandatory plugin state in plugin summaries", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await app.request("/api/plugins?tenantId=tenant-1", {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: Array<{
        effectiveState: {
          hostHealthRelevant: boolean;
          mandatory: boolean;
          mandatoryCapabilities?: string[];
        };
        hostHealthRelevant: boolean;
        id: string;
        mandatory: boolean;
        mandatoryCapabilities?: string[];
      }>;
    };
    const copilotPlugin = body.data.find(
      (entry) => entry.id === "engenty-copilot"
    );
    expect(copilotPlugin).toMatchObject({
      hostHealthRelevant: false,
      mandatory: true,
      mandatoryCapabilities: ["module.engenty-copilot", "platform.copilot"],
      effectiveState: {
        hostHealthRelevant: false,
        mandatory: true,
      },
    });
  });

  it("blocks global deactivation for mandatory plugins", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/engenty-copilot/deactivate",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      }
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: {
        code: string;
        details?: {
          lifecycle?: { eventType: string };
          pluginId?: string;
          reason?: string;
        };
      };
      ok: false;
    };
    expect(body.error.code).toBe("plugin.mandatory.deactivation_blocked");
    expect(body.error.details).toMatchObject({
      pluginId: "engenty-copilot",
      reason:
        "The copilot is the core AI assistant surface; apps/ai and the apps/ui shell depend on it.",
    });
    expect(body.error.details?.lifecycle?.eventType).toBe(
      "plugin.disable.blocked"
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "engenty-copilot",
        type: "plugin.disable.blocked",
      })
    );
  });

  it("blocks tenant deactivation for mandatory plugins", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/engenty-copilot/deactivate",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: "tenant-1" }),
      }
    );

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: {
        code: string;
        details?: {
          lifecycle?: { eventType: string };
          pluginId?: string;
          tenantId?: string;
        };
      };
      ok: false;
    };
    expect(body.error.code).toBe("plugin.mandatory.deactivation_blocked");
    expect(body.error.details).toMatchObject({
      pluginId: "engenty-copilot",
      tenantId: "tenant-1",
    });
    expect(body.error.details?.lifecycle?.eventType).toBe(
      "plugin.disable.blocked"
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "engenty-copilot",
        type: "plugin.disable.blocked",
      })
    );
  });

  it("blocks tenant activation when plugin is globally disabled", async () => {
    const registry = createRegistry();
    const contacts = registry.plugins.find(
      (plugin) => plugin.id === "contacts"
    );
    if (!contacts) {
      throw new Error("contacts fixture missing");
    }
    contacts.enabled = false;
    const { app, auditEvents } = createApp(registry);
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request("/api/plugins/contacts/activate", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: "tenant-1" }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; details?: { blockedReasons?: string[] } };
      ok: false;
    };
    expect(body.error.code).toBe("plugin.tenant_activation.blocked");
    expect(body.error.details?.blockedReasons).toContain(
      "plugin_globally_disabled"
    );
    expect(body.error.details).toMatchObject({
      lifecycle: { eventType: "plugin.enable.blocked" },
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "contacts",
        tenantId: "tenant-1",
        type: "plugin.enable.blocked",
      })
    );
  });

  it("allows tenant activation when target manifest has no requirements", async () => {
    const registry = createRegistry();
    registry.plugins.push({
      id: "commercial-settings",
      name: "Commercial Settings",
      version: "1.0.0",
      sourceType: "package",
      rootDir: path.resolve("modules/commercial-settings"),
      source: path.resolve("modules/commercial-settings/src/plugin.ts"),
      packageName: "@engenty/commercial-settings",
      manifestPath: path.resolve(
        "modules/commercial-settings/engenty.plugin.json"
      ),
      kind: "module",
      enabled: true,
      loaded: true,
      dependencies: ["ui-core"],
      provides: ["module.commercial-settings"],
      requires: [],
      cliCommands: [],
      featureFlags: [],
      services: [],
      httpRoutes: [],
      gatewayMethods: [],
      moduleOperations: [],
      queues: [],
      testDataTypes: [],
    });
    const { app, auditEvents, overrides } = createApp(registry);
    overrides["commercial-settings"] = false;
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/commercial-settings/activate",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ tenant_id: "tenant-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(overrides["commercial-settings"]).toBe(true);
    const body = (await response.json()) as {
      ok: true;
      data: { lifecycle: { eventType: string } };
    };
    expect(body.data.lifecycle.eventType).toBe("plugin.enable.succeeded");
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "commercial-settings",
        tenantId: "tenant-1",
        type: "plugin.enable.succeeded",
      })
    );
  });

  it("blocks tenant activation when a required dependency is tenant-disabled", async () => {
    const { app, overrides } = createApp();
    overrides.contacts = false;
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request("/api/plugins/leads/activate", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_id: "tenant-1" }),
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; details?: { blockedReasons?: string[] } };
      ok: false;
    };
    expect(body.error.code).toBe("plugin.tenant_activation.blocked");
    expect(body.error.details?.blockedReasons).toContain("dependency_disabled");
  });

  it("exposes a superadmin install validation report", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/engenty-copilot/install-report",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: {
        installable: boolean;
        issues: Array<{ code: string }>;
        lifecycle: { diagnostics: Array<{ operation: string }> };
        pluginId: string;
        trust: { allowed: boolean };
      };
    };
    expect(body.data.pluginId).toBe("engenty-copilot");
    expect(body.data.trust.allowed).toBe(true);
    expect(body.data.lifecycle.diagnostics).toContainEqual(
      expect.objectContaining({ operation: "install_report" })
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "engenty-copilot",
        source_component: "plugin-admin-routes",
        type: "plugin.install_report.blocked",
      })
    );
  });

  it("exposes a superadmin uninstall validation report", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/contacts/uninstall-report",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: {
        issues: Array<{ code: string }>;
        lifecycle: { eventType: string; status: string };
        pluginId: string;
        removableAtRuntime: boolean;
      };
    };
    expect(body.data.pluginId).toBe("contacts");
    expect(body.data.removableAtRuntime).toBe(false);
    expect(body.data.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.required_by_enabled_plugin",
      })
    );
    expect(body.data.lifecycle).toMatchObject({
      eventType: "plugin.uninstall_report.blocked",
      status: "blocked",
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "contacts",
        type: "plugin.uninstall_report.blocked",
      })
    );
  });

  it("blocks package install execution with lifecycle audit diagnostics", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);
    vi.mocked(executePluginPackageLifecycle).mockResolvedValue({
      activation: {
        autoEnabled: false,
        restartRequired: false,
      },
      dryRunDiff: {
        generated: false,
        installedPackageChanges: [],
        lockfileChanges: [],
        packageJsonChanges: [],
        reason: "Package-manager mutation is blocked.",
      },
      executionAvailable: false,
      issues: [
        {
          level: "warn",
          code: "plugin.install.package_mutation_deferred",
          pluginId: "leads",
          message: "Package install requires confirmation.",
        },
      ],
      mutationPlan: {
        acquisition: "pnpm_add",
        diffCapture: "planned_only",
        executionMode: "requires_confirmation",
        installedPackageTarget: "node_modules/@engenty/leads",
        lockfilePath: "pnpm-lock.yaml",
        packageJsonPath: "package.json",
        packageManager: "pnpm",
        packageSpec: "@engenty/leads",
        policy: "explicit_admin_confirmation_required",
        target: "workspace_root",
      },
      nextSteps: ["Retry with confirm_package_mutation=true."],
      operation: "install",
      pluginId: "leads",
      rollbackPolicy: {
        dataRemoval: "manual_review_required",
        lockfileMutation: "not_attempted",
        packageJsonMutation: "not_attempted",
        recovery: "No package files were changed.",
      },
      status: "blocked",
      steps: [
        {
          key: "execution_policy",
          message: "Package-manager mutation is not enabled for API execution.",
          status: "blocked",
        },
      ],
    });

    const response = await app.request("/api/plugins/leads/install", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      ok: false;
      error: {
        code: string;
        details: {
          lifecycle: { eventType: string; status: string };
          issues: Array<{ code: string }>;
        };
      };
    };
    expect(body.error.code).toBe("plugin.install.blocked");
    expect(body.error.details.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_mutation_deferred",
      })
    );
    expect(body.error.details.lifecycle).toMatchObject({
      eventType: "plugin.install.blocked",
      status: "blocked",
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "leads",
        type: "plugin.install.blocked",
      })
    );
    expect(executePluginPackageLifecycle).toHaveBeenCalledWith({
      confirmPackageMutation: false,
      operation: "install",
      pluginId: "leads",
      registry: expect.any(Object),
      unloadContext: expect.any(Object),
    });
  });

  it("returns success for confirmed package update execution", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);
    vi.mocked(executePluginPackageLifecycle).mockResolvedValue({
      activation: {
        autoEnabled: false,
        restartRequired: true,
      },
      commandPlan: {
        args: ["add", "@engenty/leads@1.2.3"],
        command: "pnpm",
        cwd: "/workspace",
        packageSpec: "@engenty/leads@1.2.3",
      },
      commandResult: {
        args: ["add", "@engenty/leads@1.2.3"],
        command: "pnpm",
        cwd: "/workspace",
        durationMs: 20,
        exitCode: 0,
        stderrSummary: "",
        stdoutSummary: "done",
      },
      dryRunDiff: {
        generated: false,
        installedPackageChanges: [],
        lockfileChanges: [],
        packageJsonChanges: [],
        reason: "Use git diff.",
      },
      executionAvailable: true,
      issues: [
        {
          level: "info",
          code: "plugin.update.package_command_succeeded",
          pluginId: "leads",
          message: "pnpm package update completed.",
        },
      ],
      mutationPlan: {
        acquisition: "pnpm_add",
        diffCapture: "git_status_and_diff",
        executionMode: "confirmed",
        installedPackageTarget: "node_modules/@engenty/leads",
        lockfilePath: "pnpm-lock.yaml",
        packageJsonPath: "package.json",
        packageManager: "pnpm",
        packageSpec: "@engenty/leads@1.2.3",
        policy: "explicit_admin_confirmation_required",
        target: "workspace_root",
      },
      nextSteps: ["Review git status and git diff."],
      operation: "update",
      pluginId: "leads",
      rollbackPolicy: {
        dataRemoval: "manual_review_required",
        lockfileMutation: "git_review_revert",
        packageJsonMutation: "git_review_revert",
        recovery: "Use git diff.",
      },
      status: "succeeded",
      steps: [
        {
          key: "command_execution",
          message: "pnpm package-manager command completed.",
          status: "succeeded",
        },
      ],
    });

    const response = await app.request("/api/plugins/leads/update", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({
        confirm_package_mutation: true,
        package_spec: "@engenty/leads@1.2.3",
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: { lifecycle: { eventType: string; status: string } };
    };
    expect(body.data.lifecycle).toMatchObject({
      eventType: "plugin.update.succeeded",
      status: "succeeded",
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "leads",
        type: "plugin.update.succeeded",
      })
    );
    expect(executePluginPackageLifecycle).toHaveBeenCalledWith({
      confirmPackageMutation: true,
      operation: "update",
      packageSpec: "@engenty/leads@1.2.3",
      pluginId: "leads",
      registry: expect.any(Object),
      unloadContext: expect.any(Object),
    });
  });

  it("blocks non-superadmin package uninstall execution", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await app.request("/api/plugins/leads/uninstall", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(executePluginPackageLifecycle).not.toHaveBeenCalled();
  });

  it("exposes a superadmin reload validation report", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);

    const response = await app.request(
      "/api/plugins/engenty-copilot/reload-report",
      {
        headers: { authorization: `Bearer ${token}` },
      }
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: {
        executionAvailable: boolean;
        issues: Array<{ code: string }>;
        pluginId: string;
        preflightPassed: boolean;
        lifecycle: { operation: string };
        steps: Array<{ implemented: boolean; key: string }>;
      };
    };
    expect(body.data.pluginId).toBe("engenty-copilot");
    expect(body.data.executionAvailable).toBe(true);
    expect(body.data.preflightPassed).toBe(true);
    expect(body.data.steps).toContainEqual(
      expect.objectContaining({
        key: "reload_factory",
        implemented: true,
      })
    );
    expect(body.data.lifecycle.operation).toBe("reload_report");
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "engenty-copilot",
        type: "plugin.reload_report.reported",
      })
    );
  });

  it("executes a superadmin backend reload", async () => {
    const registry = createRegistry();
    registry.eventsRuntime = createPluginEventsRuntime();
    const reloadEvents: unknown[] = [];
    registry.eventsRuntime.api.core.on("plugin.reload", (payload) => {
      reloadEvents.push(payload);
    });
    const { app, auditEvents } = createApp(registry);
    const token = await signCapabilityToken(["core.superadmin"]);
    vi.mocked(reloadBackendPlugin).mockResolvedValue({
      generationId: 4,
      issues: [],
      nextGenerationId: 4,
      pluginId: "leads",
      preflight: {
        executionAvailable: true,
        generationId: 3,
        hostHealthRelevant: false,
        issues: [],
        mandatory: false,
        nextGenerationId: 4,
        ownedRegistrations: {},
        pluginId: "leads",
        preflightPassed: true,
        requiresRestart: false,
        steps: [],
      },
      serviceStarts: 1,
      steps: [],
      status: "reloaded",
    });

    const response = await app.request("/api/plugins/leads/reload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tenant_id: "tenant-1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: true;
      data: {
        lifecycle: { eventType: string };
        pluginId: string;
        status: string;
      };
    };
    expect(body.data).toMatchObject({
      lifecycle: {
        eventType: "plugin.reload.succeeded",
      },
      pluginId: "leads",
      status: "reloaded",
    });
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "leads",
        tenantId: "tenant-1",
        type: "plugin.reload.succeeded",
      })
    );
    expect(reloadEvents).toContainEqual(
      expect.objectContaining({
        plugin_id: "leads",
        status: "succeeded",
      })
    );
    expect(reloadBackendPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        pluginId: "leads",
        registry: expect.any(Object),
        tenantId: "tenant-1",
      })
    );
  });

  it("reports blocked backend reload disposer diagnostics", async () => {
    const { app, auditEvents } = createApp();
    const token = await signCapabilityToken(["core.superadmin"]);
    vi.mocked(reloadBackendPlugin).mockResolvedValue({
      generationId: 3,
      issues: [
        {
          level: "error",
          code: "plugin.dispose.failed",
          pluginId: "leads",
          message: "Dispose failed (event.observer): event dispose exploded",
        },
      ],
      nextGenerationId: 4,
      pluginId: "leads",
      preflight: {
        executionAvailable: true,
        generationId: 3,
        hostHealthRelevant: false,
        issues: [],
        mandatory: false,
        nextGenerationId: 4,
        ownedRegistrations: {},
        pluginId: "leads",
        preflightPassed: true,
        requiresRestart: false,
        steps: [],
      },
      serviceStarts: 0,
      status: "blocked",
      steps: [
        {
          diagnostics: [
            {
              level: "error",
              code: "plugin.dispose.failed",
              pluginId: "leads",
              message:
                "Dispose failed (event.observer): event dispose exploded",
            },
          ],
          key: "unload",
          message: "Owned registrations unload was blocked.",
          status: "blocked",
          details: {
            disposeFailureCount: 1,
            disposeFailures: [
              {
                kind: "event.observer",
                message: "event dispose exploded",
              },
            ],
          },
        },
      ],
    });

    const response = await app.request("/api/plugins/leads/reload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      ok: false;
      error: {
        code: string;
        details: {
          issues: Array<{ code: string }>;
          lifecycle: { eventType: string };
          steps: unknown[];
        };
      };
    };
    expect(body.error.code).toBe("plugin.reload.blocked");
    expect(body.error.details.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.dispose.failed" })
    );
    expect(body.error.details.steps).toContainEqual(
      expect.objectContaining({
        key: "unload",
        details: expect.objectContaining({ disposeFailureCount: 1 }),
      })
    );
    expect(body.error.details.lifecycle.eventType).toBe(
      "plugin.reload.blocked"
    );
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        moduleId: "leads",
        type: "plugin.reload.blocked",
      })
    );
  });

  it("blocks non-superadmin reload execution", async () => {
    const { app } = createApp();
    const token = await signCapabilityToken(["core.plugins.manage"]);

    const response = await app.request("/api/plugins/leads/reload", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(403);
    expect(reloadBackendPlugin).not.toHaveBeenCalled();
  });
});
