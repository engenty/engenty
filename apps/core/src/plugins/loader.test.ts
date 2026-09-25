import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPlugins } from "./loader.js";

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

const silent = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

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

    const registry = loadPlugins({ modulesDir, packagesDir, logger: silent });

    expect(registry.plugins[0].loaded).toBe(false);
    expect(registry.cliRegistrars).toHaveLength(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.entry.missing",
        pluginId: "cli-test",
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

    const registry = loadPlugins({ modulesDir, packagesDir, logger: silent });

    expect(registry.plugins).toHaveLength(0);
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.manifest.invalid",
        pluginId: "bad",
      })
    );
  });
});
