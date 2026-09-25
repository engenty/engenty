import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  executePluginPackageLifecycle,
  type PackageLifecycleCommandResult,
} from "./package-lifecycle-executor.js";
import type { PluginRecord, PluginRegistry } from "./registry.js";

function makeTempDir(): string {
  const dir = path.join(
    os.tmpdir(),
    `engenty-package-lifecycle-${randomUUID()}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePackage(rootDir: string) {
  fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "dist", "plugin.js"),
    "export default () => undefined;"
  );
  fs.writeFileSync(path.join(rootDir, "dist", "plugin.d.ts"), "export {};");
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({
      name: "@engenty/test-package",
      version: "0.0.1",
      type: "module",
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    })
  );
  fs.writeFileSync(
    path.join(rootDir, "engenty.plugin.json"),
    JSON.stringify({
      id: "test-package",
      server: {
        entry: "./dist/plugin.js",
      },
    })
  );
}

function createPluginRecord(rootDir: string): PluginRecord {
  return {
    id: "test-package",
    cliCommands: [],
    dependencies: [],
    enabled: false,
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    loaded: false,
    manifestPath: path.join(rootDir, "engenty.plugin.json"),
    moduleOperations: [],
    packageName: "@engenty/test-package",
    queues: [],
    rootDir,
    services: [],
    source: path.join(rootDir, "dist", "plugin.js"),
    sourceType: "package",
    testDataTypes: [],
  };
}

function createRegistry(record: PluginRecord): PluginRegistry {
  return {
    aiRegistrations: [],
    cliRegistrars: [],
    diagnostics: [],
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    plugins: [record],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
  };
}

function createEmptyRegistry(): PluginRegistry {
  return {
    aiRegistrations: [],
    cliRegistrars: [],
    diagnostics: [],
    eventFilters: [],
    eventInterceptors: [],
    eventListeners: [],
    featureFlags: [],
    gatewayMethods: [],
    httpRoutes: [],
    moduleOperations: [],
    plugins: [],
    queueDefinitions: [],
    queueHandlers: new Map(),
    services: [],
    testDataTypes: [],
  };
}

function commandResult(
  overrides: Partial<PackageLifecycleCommandResult> = {}
): PackageLifecycleCommandResult {
  return {
    args: ["add", "@engenty/test-package"],
    command: "pnpm",
    cwd: "/workspace",
    durationMs: 12,
    exitCode: 0,
    stderrSummary: "",
    stdoutSummary: "done",
    ...overrides,
  };
}

function testUnloadContext() {
  return {
    config: {},
    dataDir: "/tmp",
    logger: {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    },
    resolvePath: (p: string) => p,
  };
}

describe("executePluginPackageLifecycle", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    tmpDir = "";
  });

  it("requires explicit confirmation before package-manager mutation", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const packageJsonBefore = fs.readFileSync(
      path.join(tmpDir, "package.json"),
      "utf-8"
    );
    const runner = vi.fn();

    const result = await executePluginPackageLifecycle({
      operation: "install",
      pluginId: "test-package",
      registry: createRegistry(createPluginRecord(tmpDir)),
      runner,
    });

    expect(result.status).toBe("blocked");
    expect(runner).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8")).toBe(
      packageJsonBefore
    );
  });

  it("registers a confirmed install disabled, never auto-enabled", async () => {
    tmpDir = makeTempDir();
    const registry = createEmptyRegistry();
    const installedRoot = path.join(
      tmpDir,
      "node_modules",
      "@engenty",
      "test-package"
    );
    const runner = vi.fn(async () => {
      writePackage(installedRoot);
      return commandResult({ cwd: tmpDir });
    });

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "install",
      packageSpec: "@engenty/test-package",
      pluginId: "package-acquisition",
      registry,
      runner,
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("succeeded");
    expect(registry.plugins).toEqual([
      expect.objectContaining({
        enabled: false,
        id: "test-package",
        loaded: false,
      }),
    ]);
  });

  it("does not register an undiscovered package when pnpm add fails", async () => {
    tmpDir = makeTempDir();
    const registry = createEmptyRegistry();
    const runner = vi.fn(async () =>
      commandResult({
        cwd: tmpDir,
        exitCode: 1,
        stderrSummary: "ERR_PNPM_FETCH_404 package not found",
      })
    );

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "install",
      packageSpec: "@engenty/test-package",
      pluginId: "package-acquisition",
      registry,
      runner,
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("failed");
    expect(registry.plugins).toHaveLength(0);
  });

  it("serializes confirmed package-manager operations", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    let release: (result: PackageLifecycleCommandResult) => void = () => {};
    let markStarted: () => void = () => {};
    const firstStarted = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const runner = vi.fn(
      () =>
        new Promise<PackageLifecycleCommandResult>((resolveCommand) => {
          release = resolveCommand;
          markStarted();
        })
    );
    const first = executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "install",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: "/workspace",
    });
    await firstStarted;
    const second = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "update",
      packageSpec: "@engenty/test-package@0.0.2",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: "/workspace",
    });

    expect(second.status).toBe("blocked");
    expect(second.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.package.lifecycle_in_progress",
      })
    );
    release(commandResult());
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
  });

  it.each([
    { state: { enabled: true }, label: "globally enabled" },
    { state: { loaded: true }, label: "loaded without unload context" },
  ])("refuses pnpm remove while the plugin is $label", async ({ state }) => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const record = { ...createPluginRecord(tmpDir), ...state };
    const registry = createRegistry(record);
    const runner = vi.fn();

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "uninstall",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("blocked");
    expect(runner).not.toHaveBeenCalled();
    expect(registry.plugins).toHaveLength(1);
  });

  it("stops services and drops the plugin from the registry on confirmed uninstall", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const record = createPluginRecord(tmpDir);
    record.loaded = true;
    record.services = ["test-service"];
    const registry = createRegistry(record);
    const stopped: string[] = [];
    registry.services.push({
      pluginId: "test-package",
      pluginConfig: {},
      service: {
        id: "test-service",
        start: async () => {},
        stop: async () => {
          stopped.push("test-service");
        },
      },
      source: record.source,
    });
    const runner = vi.fn(async () =>
      commandResult({
        args: ["remove", "@engenty/test-package"],
        cwd: tmpDir,
      })
    );

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "uninstall",
      pluginId: "test-package",
      registry,
      runner,
      unloadContext: testUnloadContext(),
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("succeeded");
    expect(stopped).toEqual(["test-service"]);
    expect(registry.plugins).toHaveLength(0);
    expect(registry.services).toHaveLength(0);
  });

  it("keeps registry records when pnpm remove fails", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn(async () =>
      commandResult({
        args: ["remove", "@engenty/test-package"],
        exitCode: 1,
        stderrSummary: "ERR_PNPM_CANNOT_REMOVE missing dependency",
      })
    );

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "uninstall",
      pluginId: "test-package",
      registry,
      runner,
      unloadContext: testUnloadContext(),
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("failed");
    expect(registry.plugins).toHaveLength(1);
  });
});
