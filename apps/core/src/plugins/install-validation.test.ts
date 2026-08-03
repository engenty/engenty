import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  validatePluginInstall,
  validatePluginReload,
  validatePluginUninstall,
} from "./install-validation.js";
import type { PluginRegistry } from "./registry.js";
import { makeEmptyRegistry } from "./test-fixtures.js";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-install-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackageJson(rootDir: string, overrides: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({
      name: "@engenty/test-module",
      version: "0.0.1",
      type: "module",
      ...overrides,
    })
  );
}

function writeTargetManifest(
  rootDir: string,
  overrides: Record<string, unknown> = {}
) {
  fs.writeFileSync(
    path.join(rootDir, "engenty.plugin.json"),
    JSON.stringify({
      id: "test-module",
      server: { entry: "./src/plugin.ts" },
      ...overrides,
    })
  );
}

function createRegistry(): PluginRegistry {
  return {
    ...makeEmptyRegistry(),
    cliRegistrars: [],
    diagnostics: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    plugins: [
      {
        id: "contacts",
        cliCommands: [],
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: [],
        httpRoutes: [],
        loaded: true,
        manifestPath: "/modules/contacts/engenty.plugin.json",
        moduleOperations: [],
        name: "Contacts",
        provides: ["module.contacts"],
        queues: [],
        rootDir: "/modules/contacts",
        services: [],
        source: "/modules/contacts/src/plugin.ts",
        sourceType: "module",
        testDataTypes: [],
      },
      {
        id: "leads",
        cliCommands: [],
        dependencies: [],
        enabled: true,
        featureFlags: [],
        gatewayMethods: [],
        httpRoutes: [],
        loaded: true,
        manifestPath: "/modules/leads/engenty.plugin.json",
        moduleOperations: [],
        name: "Leads",
        queues: [],
        requires: ["module.contacts"],
        rootDir: "/modules/leads",
        services: [],
        source: "/modules/leads/src/plugin.ts",
        sourceType: "module",
        testDataTypes: [],
      },
    ],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
  };
}

describe("validatePluginInstall", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("accepts a target-manifest workspace module and marks migrations for review", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    fs.mkdirSync(path.join(tmpDir, "supabase", "migrations"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "supabase", "migrations", "20260515000000_test.sql"),
      "select 1;"
    );
    writePackageJson(tmpDir, {
      engenty: { migrationsDir: "./supabase/migrations" },
    });
    writeTargetManifest(tmpDir);

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(true);
    expect(report.trust).toMatchObject({ allowed: true, level: "workspace" });
    expect(report.migrationReviewRequired).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.migration_review_required",
        level: "info",
      })
    );
  });

  it("rejects a third-party package without approved trust metadata", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, { name: "untrusted-module" });
    writeTargetManifest(tmpDir);

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.trust).toMatchObject({ allowed: false, level: "blocked" });
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.install.untrusted_package" })
    );
  });

  it("rejects install when engenty.plugin.json is missing", () => {
    tmpDir = makeTempDir();
    writePackageJson(tmpDir, {});

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.manifest.missing",
      })
    );
  });

  it("reports missing required dependencies against an installed registry", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {});
    writeTargetManifest(tmpDir, { requires: ["module.invoices"] });

    const report = validatePluginInstall({
      registry: createRegistry(),
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.required_dependency_missing",
      })
    );
  });

  it("reports package export and runtime dependency packaging issues", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/src/plugin.js",
        },
      },
      devDependencies: {
        react: "^19.0.0",
        typescript: "^5.9.3",
      },
    });
    writeTargetManifest(tmpDir);

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_export_types_missing",
      })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.runtime_dependency_in_dev",
      })
    );
  });

  it("accepts compiled package artifacts and packaged UI static assets", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist", "ui", "assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(path.join(tmpDir, "dist", "ui", "assets", "icon.svg"), "");
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "assets", "plugin.css"),
      "@layer engenty.plugins { .engenty-plugin-test-module .p-11 { padding: 2.75rem; } }"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: [
          "./dist/ui/assets",
          "./dist/ui/assets/icon.svg",
          "./dist/ui/assets/plugin.css",
        ],
        assetOrigins: ["self"],
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(true);
    expect(report.issues).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.install.compiled_artifact_unsupported",
      })
    );
  });

  it("accepts scoped runtime CSS utilities in the plugin layer", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist", "ui", "assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "assets", "plugin.css"),
      [
        "@layer engenty.plugins {",
        "  .engenty-plugin-test-module .p-11 { padding: 2.75rem; }",
        '  [data-engenty-plugin="test-module"] .mt-\\[3\\.25rem\\] { margin-top: 3.25rem; }',
        "}",
      ].join("\n")
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: ["./dist/ui/assets/plugin.css"],
        assetOrigins: ["self"],
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(true);
    expect(report.issues).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_css_scope_missing",
      })
    );
  });

  it("rejects runtime CSS assets outside the plugin layer or shipping Tailwind preflight", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist", "ui", "assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "assets", "plugin.css"),
      '@import "tailwindcss";\n.p-11 { padding: 2.75rem; }'
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: ["./dist/ui/assets/plugin.css"],
        assetOrigins: ["self"],
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_css_tailwind_bundle_blocked",
      })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_css_layer_missing",
      })
    );
  });

  it("rejects unscoped runtime CSS utilities inside the plugin layer", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist", "ui", "assets"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "plugin.js"),
      "export default () => undefined"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "assets", "plugin.css"),
      "@layer engenty.plugins { .p-11 { padding: 2.75rem; } }"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "./dist/ui/plugin.js",
        export: "default",
        staticAssets: ["./dist/ui/assets/plugin.css"],
        assetOrigins: ["self"],
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_css_scope_missing",
      })
    );
  });

  it("rejects unsupported server artifact shapes for package installs", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./src/plugin.ts",
          types: "./src/plugin.ts",
        },
      },
    });
    writeTargetManifest(tmpDir);

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.compiled_artifact_unsupported",
      })
    );
  });

  it("reports missing UI uiPlugin package export when manifest uses package import", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {
      name: "@engenty/test-module",
      exports: {
        ".": {
          default: "./dist/src/plugin.js",
          types: "./dist/src/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      capabilities: { ui: true },
      ui: {
        entry: "@engenty/test-module/ui/plugin",
        export: "default",
        load: "workspace",
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_export_missing",
      })
    );
  });

  it("accepts runtime UI entries as compiled local artifacts without package exports", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist", "ui"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default {}"
    );
    fs.writeFileSync(
      path.join(tmpDir, "dist", "ui", "plugin.mjs"),
      "export default () => undefined"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "./dist/ui/plugin.mjs",
        export: "default",
        load: "runtime",
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(true);
    expect(report.issues).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_export_missing",
      })
    );
  });

  it("rejects runtime UI entries that are package specifiers", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "dist", "plugin.js"),
      "export default {}"
    );
    writePackageJson(tmpDir, {
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      server: { entry: "./dist/plugin.js" },
      capabilities: { ui: true },
      ui: {
        entry: "@engenty/test-module/ui/plugin",
        export: "default",
        load: "runtime",
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.runtime_ui_entry_unsupported",
      })
    );
  });

  it("rejects UI entries with explicitly disabled UI capability", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {});
    writeTargetManifest(tmpDir, {
      capabilities: { ui: false },
      ui: {
        entry: "@engenty/test-module/ui/plugin",
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_capability_missing",
      })
    );
  });

  it("rejects remote UI bundle entries", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {});
    writeTargetManifest(tmpDir, {
      capabilities: { ui: true },
      ui: {
        entry: "https://cdn.example.test/plugin.js",
        export: "remoteUiPlugin",
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "package",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.remote_ui_bundle_blocked",
      })
    );
  });

  it("rejects remote server entries and unsupported static asset origins", () => {
    tmpDir = makeTempDir();
    writePackageJson(tmpDir, {});
    writeTargetManifest(tmpDir, {
      server: {
        entry: "https://cdn.example.test/server.js",
      },
      capabilities: { ui: true },
      ui: {
        entry: "@engenty/test-module/ui/plugin",
        export: "default",
        staticAssets: ["https://cdn.example.test/plugin.css"],
        assetOrigins: ["https://cdn.example.test"],
      },
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report.installable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.remote_server_entry_blocked",
      })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.remote_static_asset_blocked",
      })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.ui_asset_origin_blocked",
      })
    );
  });

  it("includes mandatory host policy in install reports", () => {
    tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "src", "plugin.ts"),
      "export default {}"
    );
    writePackageJson(tmpDir, {
      name: "@engenty/engenty-copilot",
      exports: {
        ".": {
          default: "./dist/src/plugin.js",
          types: "./dist/src/plugin.d.ts",
        },
      },
    });
    writeTargetManifest(tmpDir, {
      id: "engenty-copilot",
      provides: ["module.engenty-copilot", "platform.copilot"],
    });

    const report = validatePluginInstall({
      rootDir: tmpDir,
      sourceType: "module",
    });

    expect(report).toMatchObject({
      hostHealthRelevant: true,
      mandatory: true,
      mandatoryCapabilities: ["module.engenty-copilot", "platform.copilot"],
      mandatoryReason:
        "The copilot is the core AI assistant surface; apps/ai and the apps/ui shell depend on it.",
    });
  });

  it("blocks uninstall when enabled plugins require the package", () => {
    const report = validatePluginUninstall({
      pluginId: "contacts",
      registry: createRegistry(),
    });

    expect(report.removableAtRuntime).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.required_by_enabled_plugin",
      })
    );
  });

  it("blocks uninstall for mandatory host plugins", () => {
    const registry = createRegistry();
    registry.plugins.push({
      id: "engenty-copilot",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/engenty-copilot/engenty.plugin.json",
      moduleOperations: [],
      name: "Engenty Copilot",
      provides: ["module.engenty-copilot", "platform.copilot"],
      queues: [],
      rootDir: "/modules/engenty-copilot",
      services: [],
      source: "/modules/engenty-copilot/src/plugin.ts",
      sourceType: "module",
      testDataTypes: [],
    });

    const report = validatePluginUninstall({
      pluginId: "engenty-copilot",
      registry,
    });

    expect(report.removableAtRuntime).toBe(false);
    expect(report).toMatchObject({
      hostHealthRelevant: true,
      mandatory: true,
      mandatoryCapabilities: ["module.engenty-copilot", "platform.copilot"],
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.mandatory_plugin",
        level: "error",
      })
    );
  });

  it("blocks runtime uninstall for non-reloadable services", () => {
    const registry = createRegistry();
    registry.plugins[1].enabled = false;
    registry.services.push({
      pluginId: "contacts",
      pluginConfig: {},
      source: "/modules/contacts/src/plugin.ts",
      service: {
        id: "contacts-watch",
        reloadable: false,
        start: async () => {},
      },
    });

    const report = validatePluginUninstall({
      pluginId: "contacts",
      registry,
    });

    expect(report.removableAtRuntime).toBe(false);
    expect(report.requiresRestart).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.non_reloadable_service",
      })
    );
  });

  it("plans reload preflight for owner-tracked registrations", () => {
    tmpDir = makeTempDir();
    const registry = createRegistry();
    const source = path.join(tmpDir, "plugin.ts");
    fs.writeFileSync(source, "export default {}");
    registry.generationId = 3;
    registry.plugins[0].source = source;
    registry.httpRoutes.push({
      pluginId: "contacts",
      pluginConfig: {},
      source,
      route: {
        method: "get",
        path: "/api/contacts",
        handler: async () => ({ ok: true }),
      },
    });
    registry.services.push({
      pluginId: "contacts",
      pluginConfig: {},
      source,
      service: {
        id: "contacts-watch",
        start: async () => {},
        stop: async () => {},
      },
    });

    const report = validatePluginReload({
      pluginId: "contacts",
      registry,
    });

    expect(report.executionAvailable).toBe(true);
    expect(report.preflightPassed).toBe(true);
    expect(report.nextGenerationId).toBe(4);
    expect(report.ownedRegistrations).toMatchObject({
      httpRoutes: 1,
      services: 1,
    });
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        key: "clear_import_cache",
        implemented: true,
      })
    );
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        key: "reload_factory",
        implemented: true,
      })
    );
  });

  it("reports stale-generation async registrations during reload preflight", () => {
    tmpDir = makeTempDir();
    const registry = createRegistry();
    const source = path.join(tmpDir, "plugin.ts");
    fs.writeFileSync(source, "export default {}");
    registry.generationId = 4;
    registry.plugins[0].source = source;
    registry.gatewayMethods.push({
      pluginId: "contacts",
      pluginConfig: {},
      source,
      method: {
        name: "contacts_get",
        handler: async () => ({ ok: true }),
      },
      sourceInfo: {
        generationId: 3,
        manifestId: "contacts",
        manifestPath: "/modules/contacts/engenty.plugin.json",
        pluginId: "contacts",
        registrationKind: "server.gatewayMethod",
        rootDir: "/modules/contacts",
        source,
        sourceType: "module",
      },
    });
    registry.queueHandlers.set("contacts_reindex", {
      pluginId: "contacts",
      handler: async () => undefined,
      sourceInfo: {
        generationId: 3,
        manifestId: "contacts",
        manifestPath: "/modules/contacts/engenty.plugin.json",
        pluginId: "contacts",
        registrationKind: "server.queueHandler",
        rootDir: "/modules/contacts",
        source,
        sourceType: "module",
      },
    });

    const report = validatePluginReload({
      pluginId: "contacts",
      registry,
    });

    expect(report.preflightPassed).toBe(false);
    expect(
      report.issues.filter(
        (issue) => issue.code === "plugin.runtime.stale_generation"
      )
    ).toHaveLength(2);
    expect(report.requiresRestart).toBe(true);
  });

  it("reports UI refresh requirements for reloadable UI plugins", () => {
    tmpDir = makeTempDir();
    const registry = createRegistry();
    const source = path.join(tmpDir, "plugin.ts");
    fs.writeFileSync(source, "export default {}");
    registry.plugins[0].source = source;
    registry.plugins[0].ui = {
      entry: "@engenty/contacts/ui",
    };

    const report = validatePluginReload({
      pluginId: "contacts",
      registry,
    });

    expect(report.preflightPassed).toBe(true);
    expect(report.steps).toContainEqual(
      expect.objectContaining({
        key: "refresh_ui",
        implemented: true,
      })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.ui_refresh_required",
        level: "warn",
      })
    );
  });

  it("includes mandatory host policy in reload reports", () => {
    tmpDir = makeTempDir();
    const registry = createRegistry();
    const source = path.join(tmpDir, "plugin.ts");
    fs.writeFileSync(source, "export default {}");
    registry.plugins.push({
      id: "engenty-copilot",
      cliCommands: [],
      dependencies: [],
      enabled: true,
      featureFlags: [],
      gatewayMethods: [],
      httpRoutes: [],
      loaded: true,
      manifestPath: "/modules/engenty-copilot/engenty.plugin.json",
      moduleOperations: [],
      name: "Engenty Copilot",
      provides: ["module.engenty-copilot", "platform.copilot"],
      queues: [],
      rootDir: "/modules/engenty-copilot",
      services: [],
      source,
      sourceType: "module",
      testDataTypes: [],
    });

    const report = validatePluginReload({
      pluginId: "engenty-copilot",
      registry,
    });

    expect(report).toMatchObject({
      hostHealthRelevant: true,
      mandatory: true,
      mandatoryReason:
        "The copilot is the core AI assistant surface; apps/ai and the apps/ui shell depend on it.",
      preflightPassed: true,
    });
  });

  it("blocks reload preflight for missing source and non-reloadable services", () => {
    const registry = createRegistry();
    registry.services.push({
      pluginId: "contacts",
      pluginConfig: {},
      source: "/modules/contacts/src/plugin.ts",
      service: {
        id: "contacts-watch",
        reloadable: false,
        start: async () => {},
      },
    });

    const report = validatePluginReload({
      pluginId: "contacts",
      registry,
    });

    expect(report.preflightPassed).toBe(false);
    expect(report.requiresRestart).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.reload.source_missing" })
    );
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.non_reloadable_service",
      })
    );
  });
});
