import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import {
  createDevPluginReloadScheduler,
  isAllowedPluginReloadRelativePath,
  resolveAggregateDevPluginReloadWatchTargets,
  resolveChangedPathPlugin,
  resolveDevPluginReloadWatchTargets,
  startDevPluginReloadWatcher,
} from "./dev-reload-watcher.js";
import {
  createPluginRegistry,
  type PluginRecord,
  type PluginRegistry,
} from "./registry.js";
import type { ReloadPluginExecutionResult } from "./reload-executor.js";

function logger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

function createRegistry(plugins: PluginRecord[]) {
  const { registry } = createPluginRegistry({
    config: {},
    dataDir: "/tmp/engenty-data",
    resolvePath: (item) => path.join("/tmp/engenty-data", item),
    logger: logger(),
  });
  registry.plugins.push(...plugins);
  return registry;
}

function pluginRecord(params: {
  id: string;
  rootDir: string;
  sourceType?: PluginRecord["sourceType"];
}): PluginRecord {
  return {
    aiRegistrations: [],
    cliCommands: [],
    dependencies: [],
    enabled: true,
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    id: params.id,
    loaded: true,
    manifestPath: path.join(params.rootDir, "engenty.plugin.json"),
    moduleOperations: [],
    queues: [],
    rootDir: params.rootDir,
    services: [],
    source: params.rootDir,
    sourceType: params.sourceType ?? "module",
    testDataTypes: [],
  };
}

function reloadResult(params: {
  diagnostics?: PluginDiagnostic[];
  pluginId: string;
}): ReloadPluginExecutionResult {
  return {
    issues: [
      {
        code: "plugin.reload.failed",
        level: "error",
        message: "Reload failed.",
        pluginId: params.pluginId,
      },
    ],
    pluginId: params.pluginId,
    preflight: {
      issues: [],
      plannedSteps: [],
      pluginId: params.pluginId,
      reloadable: true,
      status: "ok",
    },
    serviceStarts: 0,
    status: "failed",
    steps: [
      {
        diagnostics: params.diagnostics,
        key: "factory_reload",
        message: "Factory reload failed.",
        status: "failed",
      },
    ],
  };
}

describe("dev plugin reload watcher", () => {
  it("maps a module file change to the loaded plugin root", () => {
    const modulesDir = path.resolve("/repo/modules");
    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: path.join(modulesDir, "contacts"),
      }),
    ]);

    const resolution = resolveChangedPathPlugin({
      changedPath: path.join(modulesDir, "contacts", "src", "plugin.ts"),
      registry,
    });

    expect(resolution).toMatchObject({
      status: "matched",
      pluginId: "contacts",
      relativePath: path.join("src", "plugin.ts"),
    });
  });

  it("ignores helper package paths that are not loaded plugin roots", () => {
    const registry = createRegistry([
      pluginRecord({
        id: "tenant-settings",
        rootDir: path.resolve("/repo/packages/tenant-settings"),
        sourceType: "package",
      }),
    ]);

    const resolution = resolveChangedPathPlugin({
      changedPath: path.resolve("/repo/packages/ui-core/src/index.ts"),
      registry,
    });

    expect(resolution).toEqual({
      status: "ignored",
      reason: "not_loaded_plugin_root",
    });
  });

  it("ignores generated output inside a loaded plugin root", () => {
    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: path.resolve("/repo/modules/contacts"),
      }),
    ]);

    const resolution = resolveChangedPathPlugin({
      changedPath: path.resolve("/repo/modules/contacts/dist/plugin.js"),
      registry,
    });

    expect(resolution).toEqual({
      status: "ignored",
      reason: "ignored_path_segment",
    });
  });

  it("ignores dev notes and other non-reload paths inside a loaded plugin root", () => {
    const registry = createRegistry([
      pluginRecord({
        id: "tasks",
        rootDir: path.resolve("/repo/modules/tasks"),
      }),
    ]);

    expect(
      resolveChangedPathPlugin({
        changedPath: path.resolve("/repo/modules/tasks/dev/README.md"),
        registry,
      })
    ).toEqual({
      status: "ignored",
      reason: "ignored_path_segment",
    });
  });

  it("allows manifest changes at the plugin root", () => {
    const registry = createRegistry([
      pluginRecord({
        id: "tasks",
        rootDir: path.resolve("/repo/modules/tasks"),
      }),
    ]);

    expect(
      resolveChangedPathPlugin({
        changedPath: path.resolve("/repo/modules/tasks/engenty.plugin.json"),
        registry,
      })
    ).toMatchObject({
      status: "matched",
      pluginId: "tasks",
      relativePath: "engenty.plugin.json",
    });
  });

  it("resolves narrow watcher targets instead of recursively watching full plugin roots", () => {
    const root = path.resolve("/repo/modules/contacts");

    expect(resolveDevPluginReloadWatchTargets([root])).toEqual([
      {
        recursive: false,
        root,
      },
      {
        recursive: true,
        root: path.join(root, "ai"),
      },
      {
        recursive: true,
        root: path.join(root, "src"),
      },
      {
        recursive: true,
        root: path.join(root, "supabase"),
      },
      {
        recursive: true,
        root: path.join(root, "ui"),
      },
    ]);
  });

  it("uses aggregate module and package roots to limit fs.watch handles", () => {
    expect(
      resolveAggregateDevPluginReloadWatchTargets({
        modulesDir: "/repo/modules",
        packagesDir: "/repo/packages",
      })
    ).toEqual([
      {
        recursive: true,
        root: path.resolve("/repo/modules"),
      },
      {
        recursive: true,
        root: path.resolve("/repo/packages"),
      },
    ]);
  });

  it("describes allowed reload path segments", () => {
    expect(isAllowedPluginReloadRelativePath("engenty.plugin.json")).toBe(true);
    expect(
      isAllowedPluginReloadRelativePath(path.join("src", "plugin.ts"))
    ).toBe(true);
    expect(
      isAllowedPluginReloadRelativePath(path.join("dev", "README.md"))
    ).toBe(false);
  });

  it("debounces reloads and propagates reload diagnostics", async () => {
    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: path.resolve("/repo/modules/contacts"),
      }),
    ]);
    const diagnostics: PluginDiagnostic[] = [];
    const results: ReloadPluginExecutionResult[] = [];
    const reloadPlugin = vi.fn(async (pluginId: string) =>
      reloadResult({
        pluginId,
        diagnostics: [
          {
            code: "plugin.load.failed",
            level: "error",
            message: "Factory failed.",
            pluginId,
          },
        ],
      })
    );
    const scheduler = createDevPluginReloadScheduler({
      debounceMs: 10,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
      onReloadResult: (result) => results.push(result),
      registry,
      reloadPlugin,
    });

    scheduler.handleChangedPath("/repo/modules/contacts/src/plugin.ts");
    scheduler.handleChangedPath("/repo/modules/contacts/src/api/index.ts");
    await scheduler.flush();

    expect(reloadPlugin).toHaveBeenCalledTimes(1);
    expect(reloadPlugin).toHaveBeenCalledWith("contacts");
    expect(results).toHaveLength(1);
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "plugin.reload.failed",
      "plugin.load.failed",
    ]);
    scheduler.close();
  });

  it("reports ambiguous duplicate plugin roots as diagnostics", () => {
    const rootDir = path.resolve("/repo/modules/contacts");
    const registry: PluginRegistry = createRegistry([
      pluginRecord({ id: "contacts", rootDir }),
      pluginRecord({ id: "contacts-copy", rootDir }),
    ]);

    const resolution = resolveChangedPathPlugin({
      changedPath: path.join(rootDir, "src", "plugin.ts"),
      registry,
    });

    expect(resolution).toMatchObject({
      status: "ignored",
      reason: "ambiguous_plugin_root",
      pluginIds: ["contacts", "contacts-copy"],
      diagnostics: [
        expect.objectContaining({
          code: "plugin.reload.watch_ambiguous_root",
        }),
      ],
    });
  });

  it("does not throw when fs.watch fails with EMFILE", () => {
    const watchRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-watch-emfile-")
    );
    const watchSpy = vi.spyOn(fs, "watch").mockImplementation(() => {
      const error = Object.assign(
        new Error("EMFILE: too many open files, watch"),
        {
          code: "EMFILE",
          errno: -24,
          syscall: "watch",
        }
      );
      throw error;
    });

    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: path.join(watchRoot, "contacts"),
      }),
    ]);
    const onWatchError = vi.fn();
    const reloadPlugin = vi.fn(async (pluginId: string) =>
      reloadResult({ pluginId })
    );

    expect(() =>
      startDevPluginReloadWatcher({
        registry,
        reloadPlugin,
        watchTargets: [
          {
            recursive: true,
            root: watchRoot,
          },
        ],
        onWatchError,
      })
    ).not.toThrow();

    expect(onWatchError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMFILE" }),
      expect.objectContaining({ root: watchRoot })
    );

    watchSpy.mockRestore();
    fs.rmSync(watchRoot, { force: true, recursive: true });
  });

  it("routes async watcher errors through onWatchError instead of crashing", () => {
    const watchRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-watch-async-")
    );
    const emitter = new EventEmitter();
    const close = vi.fn();
    const watchSpy = vi
      .spyOn(fs, "watch")
      .mockImplementation(() => Object.assign(emitter, { close }));

    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: path.join(watchRoot, "contacts"),
      }),
    ]);
    const onWatchError = vi.fn();
    const reloadPlugin = vi.fn(async (pluginId: string) =>
      reloadResult({ pluginId })
    );

    const watcher = startDevPluginReloadWatcher({
      registry,
      reloadPlugin,
      watchTargets: [
        {
          recursive: true,
          root: watchRoot,
        },
      ],
      onWatchError,
    });

    emitter.emit(
      "error",
      Object.assign(new Error("EMFILE: too many open files, watch"), {
        code: "EMFILE",
      })
    );

    expect(onWatchError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EMFILE" }),
      expect.objectContaining({ root: watchRoot })
    );
    expect(close).toHaveBeenCalled();

    watcher.close();
    watchSpy.mockRestore();
    fs.rmSync(watchRoot, { force: true, recursive: true });
  });

  it("falls back to polling when native fs.watch is unavailable", () => {
    vi.useFakeTimers();
    const watchRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "engenty-watch-poll-")
    );
    const pluginRoot = path.join(watchRoot, "contacts");
    const srcDir = path.join(pluginRoot, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const pluginFile = path.join(srcDir, "plugin.ts");
    fs.writeFileSync(pluginFile, "export {};\n");

    const watchSpy = vi.spyOn(fs, "watch").mockImplementation(() => {
      throw Object.assign(new Error("EMFILE: too many open files, watch"), {
        code: "EMFILE",
      });
    });

    const registry = createRegistry([
      pluginRecord({
        id: "contacts",
        rootDir: pluginRoot,
      }),
    ]);
    const onPollingFallback = vi.fn();
    const reloadPlugin = vi.fn(async (pluginId: string) =>
      reloadResult({ pluginId })
    );

    const watcher = startDevPluginReloadWatcher({
      registry,
      reloadPlugin,
      watchTargets: [{ recursive: true, root: watchRoot }],
      onPollingFallback,
    });

    expect(onPollingFallback).toHaveBeenCalledTimes(1);

    const updated = Date.now();
    fs.utimesSync(pluginFile, updated / 1000, updated / 1000);
    vi.advanceTimersByTime(2000);

    watcher.close();
    watchSpy.mockRestore();
    vi.useRealTimers();
    fs.rmSync(watchRoot, { force: true, recursive: true });
  });
});
