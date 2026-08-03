import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearPluginImportCache, loadPlugins } from "./loader.js";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-loader-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFakePlugin(params: {
  dir: string;
  id: string;
  body: string;
  manifest?: Record<string, unknown>;
}) {
  const { dir, id, body, manifest = {} } = params;
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: `@engenty/${id}`,
    })
  );
  fs.writeFileSync(
    path.join(dir, "engenty.plugin.json"),
    JSON.stringify({
      id,
      server: { entry: "./index.js" },
      ...manifest,
    })
  );
  fs.writeFileSync(path.join(dir, "index.js"), body);
}

describe("loadPlugins", () => {
  let tmpRoot: string;

  afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-function default export (object uiPlugin)", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "cli-test");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "cli-test",
      body: `
        export default {
          register(api) {
            api.registerCli(({ program }) => {
              program.command("cli-test").description("test");
            }, { commands: ["cli-test"] });
          },
        };
      `,
    });

    const logs: string[] = [];
    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: (m) => logs.push(m),
        warn: (m) => logs.push(m),
        error: (m) => logs.push(m),
        debug: (m) => logs.push(m),
      },
    });

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0].id).toBe("cli-test");
    expect(registry.plugins[0].loaded).toBe(false);
    expect(registry.plugins[0].loadError).toContain(
      "no default EngentyPluginFactory export"
    );
    expect(registry.cliRegistrars).toHaveLength(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.entry.missing",
        pluginId: "cli-test",
        message: expect.stringContaining("EngentyPluginFactory"),
      })
    );
  });

  it('blocks restricted surfaces for tier "plugin" with a capability diagnostic', () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "catalog-policy");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "catalog-policy",
      manifest: { tier: "plugin" },
      body: `
        export default function registerCatalogPolicy(engenty) {
          engenty.server.registerProfilePolicy(() => null);
        }
      `,
    });

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

    expect(registry.plugins[0].tier).toBe("plugin");
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.tier.capability_blocked",
        pluginId: "catalog-policy",
        level: "error",
        message: expect.stringContaining("profile merge policies"),
      })
    );
    // Hard enforcement: the restricted contribution is removed, not just flagged.
    expect(
      (registry.profilePolicies ?? []).filter(
        (p) => p.pluginId === "catalog-policy"
      )
    ).toHaveLength(0);
  });

  it('allows an adapter-shaped tier "plugin" (operations only) with no tier diagnostic', () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "catalog-adapter");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "catalog-adapter",
      manifest: { tier: "plugin" },
      body: `
        export default function registerCatalogAdapter(engenty) {
          engenty.server.registerOperation({
            operationId: "catalog_adapter_ping",
            riskLevel: "low",
            idempotent: true,
            handler: async () => ({ ok: true }),
          });
        }
      `,
    });

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

    expect(registry.plugins[0].tier).toBe("plugin");
    expect(registry.plugins[0].loaded).toBe(true);
    expect(
      registry.diagnostics.some(
        (d) => d.code === "plugin.tier.capability_blocked"
      )
    ).toBe(false);
  });

  it("loads the canonical EngentyPluginFactory default export shape", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "target-factory");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "target-factory",
      body: `
        export default function registerTargetFactory(engenty) {
          engenty.capabilities.provides("module.target-factory");
          engenty.server.registerOperation({
            operationId: "target_factory_ping",
            riskLevel: "low",
            idempotent: true,
            handler: async () => ({ ok: true }),
          });
        }
      `,
    });

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

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]).toEqual(
      expect.objectContaining({
        id: "target-factory",
        loaded: true,
        provides: ["module.target-factory"],
      })
    );
    expect(registry.moduleOperations).toHaveLength(1);
    expect(registry.moduleOperations[0]).toMatchObject({
      pluginId: "target-factory",
      operationId: "target_factory_ping",
      operation: {
        idempotent: true,
        moduleId: "target-factory",
        riskLevel: "low",
      },
    });
    expect(registry.gatewayMethods).toHaveLength(0);
    expect(registry.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.manifest.version_mismatch",
        pluginId: "target-factory",
      })
    );
  });

  it("clears only import-cache entries owned by a plugin root", () => {
    tmpRoot = makeTempDir();
    const pluginDir = path.join(tmpRoot, "modules", "cache-owner");
    const outsideDir = path.join(tmpRoot, "modules", "other-plugin");
    fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    const entryPath = path.join(pluginDir, "src", "plugin.ts");
    const helperPath = path.join(pluginDir, "src", "helper.ts");
    const outsidePath = path.join(outsideDir, "plugin.ts");
    fs.writeFileSync(entryPath, "export default function register() {}");
    fs.writeFileSync(helperPath, "export const value = 1;");
    fs.writeFileSync(outsidePath, "export default function register() {}");

    const importCache: Record<string, unknown> = {
      [entryPath]: { exports: {} },
      [helperPath]: { exports: {} },
      [outsidePath]: { exports: {} },
    };

    const result = clearPluginImportCache({
      entryPath,
      importCache,
      rootDir: pluginDir,
    });

    expect(result).toMatchObject({
      refused: false,
      removed: 2,
      rootDir: fs.realpathSync.native(pluginDir),
      entryPath: fs.realpathSync.native(entryPath),
    });
    expect(importCache[entryPath]).toBeUndefined();
    expect(importCache[helperPath]).toBeUndefined();
    expect(importCache[outsidePath]).toBeDefined();
  });

  it("refuses to clear import cache for a filesystem root", () => {
    const importCache: Record<string, unknown> = {
      [path.join(path.parse(process.cwd()).root, "tmp", "plugin.ts")]: {
        exports: {},
      },
    };

    const result = clearPluginImportCache({
      importCache,
      rootDir: path.parse(process.cwd()).root,
    });

    expect(result).toMatchObject({
      refused: true,
      removed: 0,
    });
    expect(Object.keys(importCache)).toHaveLength(1);
  });

  it("stores target event listeners with plugin ownership metadata", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "event-owner");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "event-owner",
      body: `
        export default function registerEventOwner(engenty) {
          globalThis.__engentyEventOwnerCalls = [];
          globalThis.__engentyEventOwnerEmit = () =>
            engenty.events.modules.emit(
              "knowledge-base.inbox.item.created",
              { inbox_id: "after-removal" },
              { tenantId: "tenant-1", sourceModuleId: "knowledge-base" }
            );
          engenty.events.modules.on(
            "knowledge-base.inbox.item.created",
            async (event) => {
              globalThis.__engentyEventOwnerCalls.push(String(event.inbox_id));
            },
            {
              capability: "event-owner.inbox_listener",
              requiredCapabilities: ["module.knowledge-base"],
              tenantScoped: true,
            }
          );
          engenty.events.core.intercept(
            "operation.beforeInvoke",
            async () => ({ action: "allow" }),
            { capability: "event-owner.operation_guard" }
          );
        }
      `,
    });

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

    expect(registry.eventListeners?.[0]).toMatchObject({
      pluginId: "event-owner",
      namespace: "modules",
      listenerKind: "observer",
      eventName: "knowledge-base.inbox.item.created",
      capability: "event-owner.inbox_listener",
      requiredCapabilities: ["module.knowledge-base"],
      tenantScoped: true,
      sourceInfo: {
        pluginId: "event-owner",
        registrationKind: "event.observer",
      },
    });
    expect(registry.eventInterceptors?.[0]).toMatchObject({
      pluginId: "event-owner",
      namespace: "core",
      listenerKind: "interceptor",
      eventName: "operation.beforeInvoke",
      capability: "event-owner.operation_guard",
    });
    expect(registry.plugins[0].eventListeners).toEqual([
      "modules:knowledge-base.inbox.item.created",
    ]);
    expect(registry.plugins[0].eventInterceptors).toEqual([
      "core:operation.beforeInvoke",
    ]);

    const removal = await registry.removeOwnedRegistrations?.("event-owner");
    expect(removal?.removed.eventListeners).toBe(1);
    expect(removal?.removed.eventInterceptors).toBe(1);
    expect(registry.eventListeners).toHaveLength(0);
    expect(registry.eventInterceptors).toHaveLength(0);

    await (
      globalThis as {
        __engentyEventOwnerEmit?: () => Promise<void>;
      }
    ).__engentyEventOwnerEmit?.();
    expect(
      (globalThis as { __engentyEventOwnerCalls?: string[] })
        .__engentyEventOwnerCalls
    ).toEqual([]);
    (
      globalThis as { __engentyEventOwnerCalls?: string[] }
    ).__engentyEventOwnerCalls = undefined;
    (
      globalThis as { __engentyEventOwnerEmit?: () => Promise<void> }
    ).__engentyEventOwnerEmit = undefined;
  });

  it("gates target event listener execution by tenant owner state", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "event-gated");
    const dependencyDir = path.join(modulesDir, "contacts");
    const emitterDir = path.join(modulesDir, "knowledge-base");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(dependencyDir, { recursive: true });
    fs.mkdirSync(emitterDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    // Not intersected with `typeof globalThis` — that makes the added members
    // resolve against the global scope's own declarations instead of these.
    interface EventGateGlobal {
      __engentyEmitEvent?: (tenantId?: string) => Promise<void>;
      __engentyEventCalls?: string[];
    }
    const eventGlobal = globalThis as unknown as EventGateGlobal;
    eventGlobal.__engentyEventCalls = [];
    eventGlobal.__engentyEmitEvent = undefined;
    // Read the global fresh on every call: the reset above narrows the
    // property to `undefined` for the rest of this block, and the plugin
    // loader is what assigns the real emitter afterwards.
    const emit = (tenantId?: string) =>
      (globalThis as unknown as EventGateGlobal).__engentyEmitEvent?.(
        tenantId
      ) ?? Promise.resolve();

    writeFakePlugin({
      dir: pluginDir,
      id: "event-gated",
      manifest: { requires: ["contacts"] },
      body: `
        export default function registerEventGated(engenty) {
          globalThis.__engentyEventCalls = [];
          engenty.events.modules.on(
            "knowledge-base.inbox.item.created",
            (event) => {
              globalThis.__engentyEventCalls.push(String(event.inbox_id));
            },
            {
              capability: "event-gated.inbox_listener",
              tenantScoped: true,
            }
          );
        }
      `,
    });
    writeFakePlugin({
      dir: dependencyDir,
      id: "contacts",
      body: "export default function registerContacts() {}",
    });
    writeFakePlugin({
      dir: emitterDir,
      id: "knowledge-base",
      body: `
        export default function registerKnowledgeBase(engenty) {
          globalThis.__engentyEmitEvent = (tenantId) =>
            engenty.events.modules.emit(
              "knowledge-base.inbox.item.created",
              { inbox_id: tenantId ?? "missing" },
              tenantId ? { tenantId, sourceModuleId: "knowledge-base" } : undefined
            );
        }
      `,
    });

    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      tenantPluginOverrides: {
        getOverrides: async (
          tenantId: string
        ): Promise<Record<string, boolean>> =>
          tenantId === "tenant-disabled"
            ? { "event-gated": false }
            : tenantId === "tenant-dependency-disabled"
              ? { contacts: false }
              : {},
        setOverride: async () => {},
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
    });

    await emit();
    await emit("tenant-disabled");
    await emit("tenant-dependency-disabled");
    await emit("tenant-allowed");
    const eventPlugin = registry.plugins.find(
      (plugin) => plugin.id === "event-gated"
    );
    if (eventPlugin) {
      eventPlugin.enabled = false;
    }
    await emit("tenant-globally-disabled");
    registry.generationId = (registry.generationId ?? 1) + 1;
    const stalePlugin = registry.plugins.find((p) => p.id === "event-gated");
    if (stalePlugin) {
      stalePlugin.generationId = registry.generationId;
    }
    await emit("tenant-stale-generation");

    expect(eventGlobal.__engentyEventCalls).toEqual(["tenant-allowed"]);
    expect(registry.diagnostics.map((d) => d.code)).toContain(
      "plugin.event_listener.missing_tenant"
    );
    expect(registry.diagnostics.map((d) => d.code)).toContain(
      "plugin.capability.plugin_tenant_disabled"
    );
    expect(registry.diagnostics.map((d) => d.code)).toContain(
      "plugin.dependency.disabled_required"
    );
    expect(registry.diagnostics.map((d) => d.code)).toContain(
      "plugin.capability.plugin_globally_disabled"
    );
    expect(registry.diagnostics.map((d) => d.code)).toContain(
      "plugin.runtime.stale_generation"
    );

    eventGlobal.__engentyEventCalls = undefined;
    eventGlobal.__engentyEmitEvent = undefined;
  });

  it("exposes target server registration APIs to factories", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "factory-bridge");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "factory-bridge",
      body: `
        export default function registerFactoryBridge(engenty) {
          engenty.server.registerCli(({ program }) => {
            program.command("factory-bridge").description("test");
          }, { commands: ["factory-bridge"] });
        }
      `,
    });

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

    expect(registry.plugins[0]).toEqual(
      expect.objectContaining({ id: "factory-bridge", loaded: true })
    );
    expect(registry.cliRegistrars[0].commands).toContain("factory-bridge");
    expect(registry.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.manifest.version_mismatch",
        pluginId: "factory-bridge",
      })
    );
    expect(registry.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: "test.target_server_missing",
        pluginId: "factory-bridge",
      })
    );
  });

  it("loads a module from engenty.plugin.json", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "target-only");
    fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/target-only",
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "engenty.plugin.json"),
      JSON.stringify({
        id: "target-only",
        server: { entry: "./src/plugin.js" },
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "src", "plugin.js"),
      "export default function registerTargetOnly(engenty) { engenty.server.registerCli(() => {}, { commands: ['target-only'] }); }"
    );

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

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]).toEqual(
      expect.objectContaining({
        id: "target-only",
        manifestPath: path.join(pluginDir, "engenty.plugin.json"),
        source: path.join(pluginDir, "src", "plugin.js"),
      })
    );
    expect(registry.plugins[0].loaded).toBe(true);
    expect(registry.cliRegistrars[0].commands).toContain("target-only");
  });

  it("does not infer target manifest dependencies from package.json", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "target-deps");
    fs.mkdirSync(path.join(pluginDir, "src"), { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/target-deps",
        dependencies: {
          "@engenty/plugin-sdk": "workspace:*",
          "@engenty/ui-core": "workspace:*",
        },
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "engenty.plugin.json"),
      JSON.stringify({
        id: "target-deps",
        server: { entry: "./src/plugin.js" },
        requires: [],
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "src", "plugin.js"),
      "export default function registerTargetDeps() {}"
    );

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

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]).toMatchObject({
      id: "target-deps",
      dependencies: [],
      requires: [],
    });
  });

  it("skips plugin with no register export", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "no-register");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    writeFakePlugin({
      dir: pluginDir,
      id: "no-register",
      body: "export default {};",
    });

    const warns: string[] = [];
    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: () => {},
        warn: (m) => warns.push(m),
        error: () => {},
        debug: () => {},
      },
    });

    expect(registry.plugins).toHaveLength(1);
    expect(registry.cliRegistrars).toHaveLength(0);
    expect(warns.some((w) => w.includes("EngentyPluginFactory function"))).toBe(
      true
    );
  });

  it("skips plugin with invalid manifest", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "bad-manifest");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({ name: "bad" })
    );
    fs.writeFileSync(
      path.join(pluginDir, "index.js"),
      "export default { register() {} };"
    );
    fs.writeFileSync(
      path.join(pluginDir, "engenty.plugin.json"),
      "{ not-valid-json"
    );

    const warns: string[] = [];
    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: () => {},
        warn: (m) => warns.push(m),
        error: () => {},
        debug: () => {},
      },
    });

    expect(registry.plugins).toHaveLength(0);
    expect(registry.diagnostics).toEqual([
      expect.objectContaining({
        code: "plugin.manifest.invalid",
        pluginId: "bad",
      }),
    ]);
    expect(warns.some((w) => w.includes("parse"))).toBe(true);
  });

  it("derives manifest and loads conventional module without engenty.plugin.json", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "missing-manifest");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/missing-manifest",
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "index.js"),
      "export default function registerTargetPlugin() {}"
    );

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

    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]?.id).toBe("missing-manifest");
    expect(
      registry.diagnostics.filter((d) => d.code === "plugin.manifest.missing")
    ).toHaveLength(0);
  });

  it("adds manifest version mismatch diagnostics to the registry", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "target-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "package.json"),
      JSON.stringify({
        name: "@engenty/target-plugin",
        version: "1.0.0",
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "engenty.plugin.json"),
      JSON.stringify({
        id: "target-plugin",
        version: "2.0.0",
        server: { entry: "./index.js" },
      })
    );
    fs.writeFileSync(
      path.join(pluginDir, "index.js"),
      "export default { register() {} };"
    );

    const warns: string[] = [];
    const registry = loadPlugins({
      modulesDir,
      packagesDir,
      logger: {
        info: () => {},
        warn: (m) => warns.push(m),
        error: () => {},
        debug: () => {},
      },
    });

    expect(registry.plugins).toHaveLength(1);
    expect(
      registry.diagnostics.some(
        (diagnostic) =>
          diagnostic.pluginId === "target-plugin" &&
          diagnostic.code === "plugin.manifest.version_mismatch" &&
          diagnostic.sourceInfo?.registrationKind === "server.plugin" &&
          diagnostic.message.includes("package.json version")
      )
    ).toBe(true);
    expect(
      warns.some((warning) => warning.includes("package.json version"))
    ).toBe(true);
  });

  it("returns empty registry when modules dir is empty", () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    fs.mkdirSync(modulesDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });

    const registry = loadPlugins({ modulesDir, packagesDir });
    expect(registry.plugins).toHaveLength(0);
    expect(registry.cliRegistrars).toHaveLength(0);
  });
});
