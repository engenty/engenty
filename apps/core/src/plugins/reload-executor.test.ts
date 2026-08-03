import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listActiveAiRegistrations,
  resolveAgentDefinitionById,
  unregisterAiRegistration,
} from "@engenty/ai-core";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugins } from "./loader.js";
import { reloadBackendPlugin } from "./reload-executor.js";

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `engenty-reload-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function writePlugin(params: {
  body: string;
  dir: string;
  id: string;
  provides?: string[];
  requires?: string[];
  ui?: boolean;
}) {
  fs.mkdirSync(params.dir, { recursive: true });
  fs.writeFileSync(
    path.join(params.dir, "package.json"),
    JSON.stringify({
      name: `@engenty/${params.id}`,
      version: "0.0.1",
    })
  );
  fs.writeFileSync(
    path.join(params.dir, "engenty.plugin.json"),
    JSON.stringify({
      id: params.id,
      ...(params.provides ? { provides: params.provides } : {}),
      ...(params.requires ? { requires: params.requires } : {}),
      server: {
        entry: "./src/plugin.js",
      },
      ...(params.ui
        ? {
            ui: {
              entry: `@engenty/${params.id}/ui`,
              export: "registerUi",
            },
          }
        : {}),
    })
  );
  fs.mkdirSync(path.join(params.dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(params.dir, "src", "plugin.js"), params.body);
}

function pluginBody(version: string) {
  return `
    export default function registerReloadTest(engenty) {
      globalThis.__engentyReloadEvents.push("register:${version}");
      globalThis.__engentyReloadEmit = () =>
        engenty.events.modules.emit(
          "reload-test.item.changed",
          { version: "${version}" },
          { tenantId: "tenant-1", sourceModuleId: "reload-test" }
        );
      engenty.events.core.on("plugin.shutdown", (event) => {
        if (event.plugin_id === "reload-test") {
          globalThis.__engentyReloadEvents.push("shutdown:${version}");
        }
      });
      engenty.events.modules.on("reload-test.item.changed", (event) => {
        globalThis.__engentyReloadEvents.push("event:" + String(event.version));
      });
      engenty.server.registerAiRegistration({
        agents: [
          {
            id: "reload-test.agent.${version}",
            module_id: "reload-test",
            name: "Reload Test ${version}",
            instruction_keys: [],
            build_tools: () => ({}),
          },
        ],
        module_id: "reload-test",
        triggers: [],
      });
      engenty.server.registerOperation({
        operationId: "reload_test_${version}",
        riskLevel: "low",
        idempotent: true,
        handler: async () => ({ version: "${version}" }),
      });
      engenty.server.registerService({
        id: "reload-test-service",
        start: () => {
          globalThis.__engentyReloadEvents.push("start:${version}");
        },
        stop: () => {
          globalThis.__engentyReloadEvents.push("stop:${version}");
        },
      });
    }
  `;
}

function nonReloadablePluginBody() {
  return `
    export default function registerReloadTest(engenty) {
      engenty.server.registerOperation({
        operationId: "reload_test_v1",
        riskLevel: "low",
        idempotent: true,
        handler: async () => ({ version: "v1" }),
      });
      engenty.server.registerService({
        id: "reload-test-service",
        reloadable: false,
        start: () => {},
      });
    }
  `;
}

function failingStopPluginBody() {
  return `
    export default function registerReloadTest(engenty) {
      engenty.server.registerOperation({
        operationId: "reload_test_v1",
        riskLevel: "low",
        idempotent: true,
        handler: async () => ({ version: "v1" }),
      });
      engenty.server.registerService({
        id: "reload-test-service",
        start: () => {},
        stop: () => {
          throw new Error("stop exploded");
        },
      });
    }
  `;
}

function failingReloadPluginBody() {
  return `
    export default function registerReloadTest() {
      throw new Error("reload exploded");
    }
  `;
}

describe("reload backend plugin (reloadBackendPlugin export)", () => {
  let tmpRoot = "";

  afterEach(() => {
    (
      globalThis as {
        __engentyReloadEmit?: () => Promise<void>;
        __engentyReloadEvents?: string[];
      }
    ).__engentyReloadEvents = undefined;
    (
      globalThis as {
        __engentyReloadEmit?: () => Promise<void>;
        __engentyReloadEvents?: string[];
      }
    ).__engentyReloadEmit = undefined;
    unregisterAiRegistration("reload-test");
    if (tmpRoot && fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("stops, removes, clears cache, reloads, increments generation, and starts owned services", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });

    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });

    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v1"]
    );
    expect(resolveAgentDefinitionById("reload-test.agent.v1")?.name).toBe(
      "Reload Test v1"
    );

    writePlugin({
      body: pluginBody("v2"),
      dir: pluginDir,
      id: "reload-test",
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("reloaded");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "succeeded"],
      ["manifest_preflight", "succeeded"],
      ["shutdown_event", "succeeded"],
      ["unload", "succeeded"],
      ["cache_clear", "succeeded"],
      ["manifest_reload", "succeeded"],
      ["factory_reload", "succeeded"],
      ["activation", "succeeded"],
      ["service_start", "succeeded"],
      ["result", "succeeded"],
    ]);
    expect(result.steps.find((step) => step.key === "unload")).toMatchObject({
      details: {
        removed: expect.objectContaining({
          aiRegistrations: 1,
          moduleOperations: 1,
        }),
        serviceStop: expect.objectContaining({ stopped: 1 }),
      },
    });
    expect(
      result.steps.find((step) => step.key === "cache_clear")?.details
    ).toMatchObject({ refused: false });
    expect(result.preflight.preflightPassed).toBe(true);
    expect(result.unload?.removal?.removed.moduleOperations).toBe(1);
    expect(result.cacheClear?.refused).toBe(false);
    expect(registry.generationId).toBe(2);
    expect(registry.plugins[0]).toMatchObject({
      id: "reload-test",
      generationId: 2,
      loaded: true,
    });
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v2"]
    );
    expect(
      listActiveAiRegistrations()
        .filter((registration) => registration.module_id === "reload-test")
        .map((registration) => registration.module_id)
    ).toEqual(["reload-test"]);
    expect(resolveAgentDefinitionById("reload-test.agent.v1")).toBeUndefined();
    expect(resolveAgentDefinitionById("reload-test.agent.v2")?.name).toBe(
      "Reload Test v2"
    );
    expect(result.unload?.removal?.removed.aiRegistrations).toBe(1);
    expect(registry.moduleOperations[0].sourceInfo?.generationId).toBe(2);
    expect(
      (globalThis as unknown as { __engentyReloadEvents: string[] })
        .__engentyReloadEvents
    ).toEqual([
      "register:v1",
      "start:v1",
      "shutdown:v1",
      "stop:v1",
      "register:v2",
      "start:v2",
    ]);

    await (
      globalThis as { __engentyReloadEmit?: () => Promise<void> }
    ).__engentyReloadEmit?.();
    expect(
      (globalThis as unknown as { __engentyReloadEvents: string[] })
        .__engentyReloadEvents
    ).toEqual([
      "register:v1",
      "start:v1",
      "shutdown:v1",
      "stop:v1",
      "register:v2",
      "start:v2",
      "event:v2",
    ]);
    expect(registry.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "plugin.runtime.stale_generation" })
    );
  });

  it("preserves tenant activation across successful reload", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    writePlugin({
      body: pluginBody("v2"),
      dir: pluginDir,
      id: "reload-test",
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
      resolveTenantPluginOverrides: async () => ({ "reload-test": true }),
      tenantId: "tenant-1",
    });

    expect(result.status).toBe("reloaded");
    expect(registry.plugins[0]).toMatchObject({
      enabled: true,
      generationId: 2,
      loaded: true,
    });
    expect(result.activation).toMatchObject({
      generationId: 2,
      globalEnabled: true,
      tenantId: "tenant-1",
      tenantOverride: true,
      effectiveState: {
        allowed: true,
        tenantEnabled: true,
        state: "capability_enabled",
      },
    });
    expect(
      result.steps.find((step) => step.key === "activation")
    ).toMatchObject({
      status: "succeeded",
      details: expect.objectContaining({
        globalEnabled: true,
        tenantEnabled: true,
        tenantOverride: true,
      }),
    });
  });

  it("marks UI contribution refresh when a reloaded plugin has UI metadata", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
      ui: true,
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    writePlugin({
      body: pluginBody("v2"),
      dir: pluginDir,
      id: "reload-test",
      ui: true,
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("reloaded");
    expect(result.uiRefresh).toEqual({
      generationId: 2,
      invalidationRequired: true,
      pluginId: "reload-test",
      reason: "ui_contributions_may_have_changed",
    });
    expect(
      result.steps.find((step) => step.key === "ui_refresh")
    ).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          code: "plugin.reload.ui_refresh_required",
          pluginId: "reload-test",
        }),
      ],
      details: result.uiRefresh,
      status: "succeeded",
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.ui_refresh_required",
        pluginId: "reload-test",
      })
    );
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.ui_refresh_required",
        pluginId: "reload-test",
      })
    );
  });

  it("recalculates tenant blockers against the reloaded manifest", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    writePlugin({
      body: pluginBody("v2"),
      dir: pluginDir,
      id: "reload-test",
      requires: ["module.missing-dependency"],
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
      resolveTenantPluginOverrides: async () => ({ "reload-test": true }),
      tenantId: "tenant-1",
    });

    expect(result.status).toBe("reloaded");
    expect(result.activation?.effectiveState).toMatchObject({
      allowed: false,
      blockedReasons: ["dependency_missing"],
      tenantEnabled: true,
    });
    expect(
      result.steps.find((step) => step.key === "activation")
    ).toMatchObject({
      status: "blocked",
      diagnostics: [
        expect.objectContaining({
          code: "plugin.dependency.missing_required",
        }),
      ],
      details: expect.objectContaining({
        blockedReasons: ["dependency_missing"],
        tenantEnabled: true,
      }),
    });
  });

  it("blocks before mutation when reload validation fails", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    registry.plugins[0].source = path.join(pluginDir, "src", "missing.js");

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("blocked");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "blocked"],
    ]);
    expect(result.steps[0].diagnostics).toContainEqual(
      expect.objectContaining({ code: "plugin.reload.source_missing" })
    );
    expect(result.unload).toBeUndefined();
    expect(result.cacheClear).toBeUndefined();
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v1"]
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.reload.source_missing" })
    );
  });

  it("blocks unload for non-reloadable services without removing registrations", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    writePlugin({
      body: nonReloadablePluginBody(),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("blocked");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "blocked"],
    ]);
    expect(result.unload).toBeUndefined();
    expect(result.cacheClear).toBeUndefined();
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.non_reloadable_service",
      })
    );
  });

  it("blocks on service stop failure and preserves owned registrations", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    writePlugin({
      body: failingStopPluginBody(),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("blocked");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "succeeded"],
      ["manifest_preflight", "succeeded"],
      ["shutdown_event", "succeeded"],
      ["unload", "blocked"],
    ]);
    expect(result.steps.find((step) => step.key === "unload")).toMatchObject({
      diagnostics: [
        expect.objectContaining({ code: "plugin.service.stop_failed" }),
      ],
      details: {
        serviceStop: expect.objectContaining({ failed: 1 }),
      },
    });
    expect(result.unload?.serviceStop.failed).toBe(1);
    expect(result.unload?.removal).toBeUndefined();
    expect(result.cacheClear).toBeUndefined();
    expect(registry.moduleOperations).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.service.stop_failed" })
    );
  });

  it("blocks on event disposer failure and keeps stale handlers explicit", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    const staleModuleEvent = registry.eventListeners?.find(
      (entry) => entry.eventName === "reload-test.item.changed"
    );
    expect(staleModuleEvent).toBeTruthy();
    staleModuleEvent!.dispose = () => {
      throw new Error("event dispose exploded");
    };
    writePlugin({
      body: pluginBody("v2"),
      dir: pluginDir,
      id: "reload-test",
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("blocked");
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "succeeded"],
      ["manifest_preflight", "succeeded"],
      ["shutdown_event", "succeeded"],
      ["unload", "blocked"],
    ]);
    expect(result.steps.find((step) => step.key === "unload")).toMatchObject({
      diagnostics: [expect.objectContaining({ code: "plugin.dispose.failed" })],
      details: {
        disposeFailureCount: 1,
        disposeFailures: [
          expect.objectContaining({
            kind: "event.observer",
            message: "event dispose exploded",
          }),
        ],
      },
    });
    expect(result.unload?.removal).toMatchObject({
      blocked: true,
      disposeFailureCount: 1,
      totalRemoved: 0,
    });
    expect(result.cacheClear).toBeUndefined();
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v1"]
    );
    expect(resolveAgentDefinitionById("reload-test.agent.v1")?.name).toBe(
      "Reload Test v1"
    );
    expect(resolveAgentDefinitionById("reload-test.agent.v2")).toBeUndefined();
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "plugin.dispose.failed" })
    );

    await (
      globalThis as { __engentyReloadEmit?: () => Promise<void> }
    ).__engentyReloadEmit?.();
    expect(
      (globalThis as unknown as { __engentyReloadEvents: string[] })
        .__engentyReloadEvents
    ).toContain("event:v1");
  });

  it("reports factory reload failures in ordered diagnostics", async () => {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({
      body: pluginBody("v1"),
      dir: pluginDir,
      id: "reload-test",
    });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    writePlugin({
      body: failingReloadPluginBody(),
      dir: pluginDir,
      id: "reload-test",
    });

    const result = await reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });

    expect(result.status).toBe("failed");
    expect(result.registration?.loaded).toBe(false);
    expect(result.steps.map((step) => [step.key, step.status])).toEqual([
      ["validation", "succeeded"],
      ["manifest_preflight", "succeeded"],
      ["shutdown_event", "succeeded"],
      ["unload", "succeeded"],
      ["cache_clear", "succeeded"],
      ["manifest_reload", "succeeded"],
      ["factory_reload", "failed"],
      ["activation", "skipped"],
      ["service_start", "skipped"],
      ["result", "failed"],
    ]);
    expect(
      result.steps.find((step) => step.key === "factory_reload")
    ).toMatchObject({
      details: { loadError: expect.stringContaining("reload exploded") },
      diagnostics: [expect.objectContaining({ code: "plugin.load.failed" })],
    });
    expect(registry.plugins[0]).toMatchObject({
      enabled: true,
      generationId: 2,
      loaded: false,
    });
    expect(result.activation).toBeUndefined();
  });
});
