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

function writePackage(
  rootDir: string,
  params: { migrations?: boolean; name?: string } = {}
) {
  fs.mkdirSync(path.join(rootDir, "dist"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "dist", "plugin.js"),
    "export default () => undefined;"
  );
  fs.writeFileSync(path.join(rootDir, "dist", "plugin.d.ts"), "export {};");
  fs.writeFileSync(
    path.join(rootDir, "package.json"),
    JSON.stringify({
      name: params.name ?? "@engenty/test-package",
      version: "0.0.1",
      type: "module",
      ...(params.migrations
        ? { engenty: { migrationsDir: "./supabase/migrations" } }
        : {}),
      exports: {
        ".": {
          default: "./dist/plugin.js",
          types: "./dist/plugin.d.ts",
        },
      },
    })
  );
  if (params.migrations) {
    fs.mkdirSync(path.join(rootDir, "supabase", "migrations"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(rootDir, "supabase", "migrations", "20260515000000_test.sql"),
      "select 1;"
    );
  }
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
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn();

    const result = await executePluginPackageLifecycle({
      operation: "install",
      pluginId: "test-package",
      registry,
      runner,
    });

    expect(result.status).toBe("blocked");
    expect(result.executionAvailable).toBe(true);
    expect(result.mutationPlan).toMatchObject({
      diffCapture: "planned_only",
      executionMode: "requires_confirmation",
      lockfilePath: "pnpm-lock.yaml",
      packageJsonPath: "package.json",
      packageManager: "pnpm",
      packageSpec: "@engenty/test-package",
      policy: "explicit_admin_confirmation_required",
      target: "workspace_root",
    });
    expect(result.dryRunDiff).toMatchObject({
      generated: false,
      lockfileChanges: [],
      packageJsonChanges: [],
    });
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "validation",
        status: "succeeded",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_mutation_deferred",
      })
    );
    expect(registry.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_mutation_deferred",
      })
    );
    expect(runner).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8")).toBe(
      packageJsonBefore
    );
  });

  it("runs confirmed install for an undiscovered package spec", async () => {
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
    expect(result.pluginId).toBe("test-package");
    expect(result.activation).toEqual({
      autoEnabled: false,
      restartRequired: false,
    });
    expect(result.commandPlan).toMatchObject({
      args: ["add", "@engenty/test-package"],
      command: "pnpm",
      cwd: tmpDir,
      packageSpec: "@engenty/test-package",
    });
    expect(result.discovery).toMatchObject({
      discoverable: true,
      loadable: true,
      packageName: "@engenty/test-package",
      pluginId: "test-package",
      registered: true,
      restartRequired: false,
      status: "registered_disabled",
    });
    expect(registry.plugins).toHaveLength(1);
    expect(registry.plugins[0]).toMatchObject({
      enabled: false,
      id: "test-package",
      loaded: false,
      packageName: "@engenty/test-package",
      rootDir: fs.realpathSync.native(installedRoot),
      sourceType: "package",
    });
    expect(runner).toHaveBeenCalledWith(result.commandPlan);
    expect(result.nextSteps).toContain(
      "Enable the plugin globally when ready."
    );
    expect(result.nextSteps).toContain(
      "Enable tenant overrides explicitly for tenants that should receive it."
    );
  });

  it("surfaces migration review before explicit activation", async () => {
    tmpDir = makeTempDir();
    const registry = createEmptyRegistry();
    const installedRoot = path.join(
      tmpDir,
      "node_modules",
      "@engenty",
      "test-package"
    );
    const runner = vi.fn(async () => {
      writePackage(installedRoot, { migrations: true });
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
    expect(result.discovery?.validation).toMatchObject({
      migrationReviewRequired: true,
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.migration_review_required",
      })
    );
    expect(result.nextSteps).toEqual(
      expect.arrayContaining([
        "Review git status and git diff for package.json and pnpm-lock.yaml.",
        "Commit accepted package-manager changes or revert them with git.",
        "Review and aggregate package migrations before enabling the plugin.",
        "Enable the plugin globally when ready.",
        "Enable tenant overrides explicitly for tenants that should receive it.",
      ])
    );
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
    expect(result.pluginId).toBe("package-acquisition");
    expect(result.commandPlan).toMatchObject({
      args: ["add", "@engenty/test-package"],
    });
    expect(result.discovery).toBeUndefined();
    expect(registry.plugins).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_command_failed",
      })
    );
  });

  it("runs post-install validation for an undiscovered package", async () => {
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
      fs.writeFileSync(
        path.join(installedRoot, "dist", "plugin.ts"),
        "export default () => undefined;"
      );
      fs.writeFileSync(
        path.join(installedRoot, "engenty.plugin.json"),
        JSON.stringify({
          id: "test-package",
          server: {
            entry: "./dist/plugin.ts",
          },
        })
      );
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
    expect(result.activation).toEqual({
      autoEnabled: false,
      restartRequired: true,
    });
    expect(result.discovery).toMatchObject({
      discoverable: true,
      loadable: false,
      packageName: "@engenty/test-package",
      registered: false,
      restartRequired: true,
      status: "invalid",
    });
    expect(registry.plugins).toHaveLength(0);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.compiled_artifact_unsupported",
      })
    );
    expect(result.nextSteps).toContain(
      "Resolve package validation diagnostics before activation."
    );
  });

  it("runs confirmed install through pnpm add without auto-enabling", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const record = createPluginRecord(tmpDir);
    const registry = createRegistry(record);
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
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("succeeded");
    expect(result.activation).toEqual({
      autoEnabled: false,
      restartRequired: false,
    });
    expect(record.enabled).toBe(false);
    expect(record.loaded).toBe(false);
    expect(record.rootDir).toBe(fs.realpathSync.native(installedRoot));
    expect(result.commandPlan).toMatchObject({
      args: ["add", "@engenty/test-package"],
      command: "pnpm",
      cwd: tmpDir,
      packageSpec: "@engenty/test-package",
    });
    expect(result.discovery).toMatchObject({
      discoverable: true,
      loadable: true,
      packageName: "@engenty/test-package",
      pluginId: "test-package",
      registered: true,
      restartRequired: false,
      status: "registered_disabled",
    });
    expect(runner).toHaveBeenCalledWith(result.commandPlan);
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "command_execution",
        status: "succeeded",
      })
    );
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "post_install_discovery",
        status: "succeeded",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_command_succeeded",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_discovery_registered_disabled",
      })
    );
    expect(result.nextSteps).toContain(
      "Enable the plugin globally when ready."
    );
    expect(result.nextSteps).toContain(
      "Enable tenant overrides explicitly for tenants that should receive it."
    );
  });

  it("reports explicit discovery next steps when pnpm add does not leave an installed package", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn(async () => commandResult({ cwd: tmpDir }));

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "install",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: tmpDir,
    });

    expect(result.status).toBe("succeeded");
    expect(result.activation.restartRequired).toBe(true);
    expect(result.discovery).toMatchObject({
      discoverable: false,
      loadable: false,
      packageName: "@engenty/test-package",
      registered: false,
      restartRequired: true,
      status: "missing",
    });
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "post_install_discovery",
        status: "failed",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_discovery_missing",
      })
    );
    expect(result.nextSteps).toContain(
      "Restart API discovery after resolving the missing installed package."
    );
  });

  it("plans update as pnpm add package@version", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn(async () =>
      commandResult({
        args: ["add", "@engenty/test-package@0.0.2"],
      })
    );

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "update",
      packageSpec: "@engenty/test-package@0.0.2",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: "/workspace",
    });

    expect(result.status).toBe("succeeded");
    expect(result.commandPlan).toMatchObject({
      args: ["add", "@engenty/test-package@0.0.2"],
      packageSpec: "@engenty/test-package@0.0.2",
    });
  });

  it("returns failed diagnostics when pnpm add fails", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn(async () =>
      commandResult({
        exitCode: 1,
        stderrSummary: "ERR_PNPM_FETCH_404 package not found",
      })
    );

    const result = await executePluginPackageLifecycle({
      confirmPackageMutation: true,
      operation: "install",
      pluginId: "test-package",
      registry,
      runner,
      workspaceRoot: "/workspace",
    });

    expect(result.status).toBe("failed");
    expect(result.commandResult).toMatchObject({
      exitCode: 1,
      stderrSummary: "ERR_PNPM_FETCH_404 package not found",
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.package_command_failed",
      })
    );
    expect(result.rollbackPolicy).toMatchObject({
      lockfileMutation: "git_review_revert",
      packageJsonMutation: "git_review_revert",
    });
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

  it("blocks update execution when package validation fails", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    fs.rmSync(path.join(tmpDir, "dist", "plugin.js"));
    const registry = createRegistry(createPluginRecord(tmpDir));

    const result = await executePluginPackageLifecycle({
      operation: "update",
      pluginId: "test-package",
      registry,
    });

    expect(result.status).toBe("blocked");
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "validation",
        status: "blocked",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.install.entry_missing",
      })
    );
    expect(result.issues).not.toContainEqual(
      expect.objectContaining({
        code: "plugin.update.package_mutation_deferred",
      })
    );
  });

  it("requires explicit confirmation before pnpm remove", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const registry = createRegistry(createPluginRecord(tmpDir));
    const runner = vi.fn();

    const result = await executePluginPackageLifecycle({
      operation: "uninstall",
      pluginId: "test-package",
      registry,
      runner,
    });

    expect(result.status).toBe("blocked");
    expect(result.executionAvailable).toBe(true);
    expect(result.mutationPlan).toMatchObject({
      acquisition: "pnpm_remove",
      executionMode: "requires_confirmation",
      packageSpec: "@engenty/test-package",
    });
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "validation",
        status: "succeeded",
      })
    );
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "mutation_plan",
        status: "succeeded",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.package_mutation_deferred",
      })
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("blocks pnpm remove while the plugin is globally enabled", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const record = createPluginRecord(tmpDir);
    record.enabled = true;
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
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.global_disable_required",
      })
    );
    expect(result.nextSteps).toContain(
      "Disable the plugin globally before package removal."
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("blocks pnpm remove for loaded plugins without unload context", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const record = createPluginRecord(tmpDir);
    record.loaded = true;
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
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.runtime_unload_required",
      })
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("runs confirmed uninstall through pnpm remove after safe unload", async () => {
    tmpDir = makeTempDir();
    writePackage(tmpDir);
    const packageJsonBefore = fs.readFileSync(
      path.join(tmpDir, "package.json"),
      "utf-8"
    );
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
    expect(result.activation).toEqual({
      autoEnabled: false,
      restartRequired: false,
    });
    expect(stopped).toEqual(["test-service"]);
    expect(result.commandPlan).toMatchObject({
      args: ["remove", "@engenty/test-package"],
      command: "pnpm",
      cwd: tmpDir,
      packageSpec: "@engenty/test-package",
    });
    expect(result.unload).toMatchObject({
      blocked: false,
      serviceStop: {
        stopped: 1,
      },
    });
    expect(registry.plugins).toHaveLength(0);
    expect(registry.services).toHaveLength(0);
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "runtime_unload",
        status: "succeeded",
      })
    );
    expect(result.steps).toContainEqual(
      expect.objectContaining({
        key: "cleanup_policy",
        status: "succeeded",
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.data_review_required",
      })
    );
    expect(result.nextSteps).toContain(
      "Review retained module data and applied migrations manually; uninstall does not delete data."
    );
    expect(runner).toHaveBeenCalledWith(result.commandPlan);
    expect(fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8")).toBe(
      packageJsonBefore
    );
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
    expect(result.commandResult).toMatchObject({
      args: ["remove", "@engenty/test-package"],
      exitCode: 1,
      stderrSummary: "ERR_PNPM_CANNOT_REMOVE missing dependency",
    });
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: "plugin.uninstall.package_command_failed",
      })
    );
    expect(registry.plugins).toHaveLength(1);
    expect(runner).toHaveBeenCalledWith(result.commandPlan);
  });
});
