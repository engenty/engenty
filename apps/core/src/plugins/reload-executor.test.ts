import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  resolveSkillDefinitionById,
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

function writePlugin(params: { body: string; dir: string; id: string }) {
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
      server: {
        entry: "./src/plugin.js",
      },
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
        module_id: "reload-test",
        skills: [
          {
            description: "Reload test skill.",
            name: "reload-test-${version}",
            title: "Reload Test ${version}",
          },
        ],
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

  function setupPlugin(body: string) {
    tmpRoot = makeTempDir();
    const modulesDir = path.join(tmpRoot, "modules");
    const packagesDir = path.join(tmpRoot, "packages");
    const pluginDir = path.join(modulesDir, "reload-test");
    fs.mkdirSync(packagesDir, { recursive: true });
    (
      globalThis as unknown as { __engentyReloadEvents: string[] }
    ).__engentyReloadEvents = [];
    writePlugin({ body, dir: pluginDir, id: "reload-test" });
    const registry = loadPlugins({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      modulesDir,
      packagesDir,
    });
    return { pluginDir, registry };
  }

  function reload(registry: ReturnType<typeof loadPlugins>) {
    return reloadBackendPlugin({
      dataDir: path.join(tmpRoot, "data"),
      logger: logger(),
      pluginId: "reload-test",
      registry,
      resolvePath: (item) => path.resolve(tmpRoot, "data", item),
    });
  }

  function reloadEvents(): string[] {
    return (globalThis as unknown as { __engentyReloadEvents: string[] })
      .__engentyReloadEvents;
  }

  async function emitReloadEvent() {
    await (
      globalThis as { __engentyReloadEmit?: () => Promise<void> }
    ).__engentyReloadEmit?.();
  }

  it("replaces the old generation's operations, skills and event handlers with the new ones", async () => {
    const { pluginDir, registry } = setupPlugin(pluginBody("v1"));
    writePlugin({ body: pluginBody("v2"), dir: pluginDir, id: "reload-test" });

    const result = await reload(registry);

    expect(result.status).toBe("reloaded");
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v2"]
    );
    expect(resolveSkillDefinitionById("reload-test-v1")).toBeUndefined();
    expect(resolveSkillDefinitionById("reload-test-v2")).toBeDefined();
    expect(reloadEvents()).toEqual([
      "register:v1",
      "start:v1",
      "shutdown:v1",
      "stop:v1",
      "register:v2",
      "start:v2",
    ]);

    await emitReloadEvent();
    expect(reloadEvents().filter((e) => e.startsWith("event:"))).toEqual([
      "event:v2",
    ]);
  });

  it("blocks before mutation when reload validation fails", async () => {
    const { pluginDir, registry } = setupPlugin(pluginBody("v1"));
    registry.plugins[0].source = path.join(pluginDir, "src", "missing.js");

    const result = await reload(registry);

    expect(result.status).toBe("blocked");
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v1"]
    );
  });

  it("blocks unload for non-reloadable services without removing registrations", async () => {
    const { registry } = setupPlugin(nonReloadablePluginBody());

    const result = await reload(registry);

    expect(result.status).toBe("blocked");
    expect(result.unload).toBeUndefined();
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations).toHaveLength(1);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.reload.non_reloadable_service",
      })
    );
  });

  it("keeps the old generation fully live when an event disposer fails during unload", async () => {
    const { pluginDir, registry } = setupPlugin(pluginBody("v1"));
    const moduleEvent = registry.eventListeners?.find(
      (entry) => entry.eventName === "reload-test.item.changed"
    );
    expect(moduleEvent).toBeTruthy();
    moduleEvent!.dispose = () => {
      throw new Error("event dispose exploded");
    };
    writePlugin({ body: pluginBody("v2"), dir: pluginDir, id: "reload-test" });

    const result = await reload(registry);

    expect(result.status).toBe("blocked");
    expect(registry.generationId).toBe(1);
    expect(registry.moduleOperations.map((entry) => entry.operationId)).toEqual(
      ["reload_test_v1"]
    );
    expect(resolveSkillDefinitionById("reload-test-v1")).toBeDefined();
    expect(resolveSkillDefinitionById("reload-test-v2")).toBeUndefined();

    await emitReloadEvent();
    expect(reloadEvents()).toContain("event:v1");
  });
});
