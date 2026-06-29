import fs from "node:fs";
import path from "node:path";
import type { PluginDiagnostic } from "@engenty/plugin-sdk";
import type { PluginRecord, PluginRegistry } from "./registry.js";
import type { ReloadPluginExecutionResult } from "./reload-executor.js";

const ignoredPathSegments = new Set([
  ".next",
  ".git",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
]);

const recursiveWatchSubdirectories = ["ai", "src", "supabase", "ui"];

const pluginRootMetadataFiles = new Set(["engenty.plugin.json"]);
const DEFAULT_POLL_INTERVAL_MS = 2000;

export type DevReloadChangeResolution =
  | {
      plugin: PluginRecord;
      pluginId: string;
      reason: "plugin_root_match";
      relativePath: string;
      status: "matched";
    }
  | {
      reason:
        | "ambiguous_plugin_root"
        | "ignored_path_segment"
        | "not_loaded_plugin_root";
      status: "ignored";
      diagnostics?: PluginDiagnostic[];
      pluginIds?: string[];
    };

export interface DevPluginReloadScheduler {
  close: () => void;
  flush: (pluginId?: string) => Promise<void>;
  handleChangedPath: (changedPath: string) => DevReloadChangeResolution;
}

export interface DevPluginReloadWatcher {
  close: () => void;
  scheduler: DevPluginReloadScheduler;
}

export interface DevPluginReloadWatchTarget {
  recursive: boolean;
  root: string;
}

type TimerHandle = ReturnType<typeof setTimeout>;

function normalizePath(filePath: string) {
  return path.resolve(filePath);
}

function isPathInRoot(filePath: string, rootDir: string) {
  const relative = path.relative(rootDir, filePath);
  return (
    relative === "" ||
    (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function pathSegments(filePath: string) {
  return normalizePath(filePath).split(path.sep).filter(Boolean);
}

function isIgnoredPath(filePath: string) {
  return pathSegments(filePath).some((segment) =>
    ignoredPathSegments.has(segment)
  );
}

export function isAllowedPluginReloadRelativePath(relativePath: string) {
  if (pluginRootMetadataFiles.has(relativePath)) {
    return true;
  }
  const firstSegment = relativePath.split(path.sep).filter(Boolean)[0];
  return !!firstSegment && recursiveWatchSubdirectories.includes(firstSegment);
}

function createAmbiguousPluginRootDiagnostic(params: {
  changedPath: string;
  pluginIds: string[];
}): PluginDiagnostic {
  return {
    level: "error",
    code: "plugin.reload.watch_ambiguous_root",
    message: `Changed path matches multiple plugin roots: ${params.changedPath}`,
    remediation:
      "Reload a specific plugin manually; plugin-aware dev reload only handles one root at a time.",
  };
}

export function resolveChangedPathPlugin(params: {
  changedPath: string;
  registry: PluginRegistry;
}): DevReloadChangeResolution {
  const changedPath = normalizePath(params.changedPath);
  if (isIgnoredPath(changedPath)) {
    return { status: "ignored", reason: "ignored_path_segment" };
  }

  const matches = params.registry.plugins
    .filter((plugin) => plugin.loaded)
    .filter((plugin) =>
      isPathInRoot(changedPath, normalizePath(plugin.rootDir))
    )
    .sort((a, b) => b.rootDir.length - a.rootDir.length);

  if (matches.length === 0) {
    return { status: "ignored", reason: "not_loaded_plugin_root" };
  }

  const nearestRoot = normalizePath(matches[0].rootDir);
  const nearestMatches = matches.filter(
    (plugin) => normalizePath(plugin.rootDir) === nearestRoot
  );
  if (nearestMatches.length > 1) {
    const pluginIds = nearestMatches.map((plugin) => plugin.id);
    return {
      status: "ignored",
      reason: "ambiguous_plugin_root",
      pluginIds,
      diagnostics: [
        createAmbiguousPluginRootDiagnostic({ changedPath, pluginIds }),
      ],
    };
  }

  const plugin = matches[0];
  const relativePath = path.relative(
    normalizePath(plugin.rootDir),
    changedPath
  );
  if (!isAllowedPluginReloadRelativePath(relativePath)) {
    return { status: "ignored", reason: "ignored_path_segment" };
  }

  return {
    status: "matched",
    reason: "plugin_root_match",
    plugin,
    pluginId: plugin.id,
    relativePath,
  };
}

export function createDevPluginReloadScheduler(params: {
  debounceMs?: number;
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
  onReloadResult?: (result: ReloadPluginExecutionResult) => void;
  registry: PluginRegistry;
  reloadPlugin: (pluginId: string) => Promise<ReloadPluginExecutionResult>;
}): DevPluginReloadScheduler {
  const debounceMs = params.debounceMs ?? 150;
  const pending = new Map<string, TimerHandle>();

  const runReload = async (pluginId: string) => {
    const timer = pending.get(pluginId);
    if (timer) {
      clearTimeout(timer);
      pending.delete(pluginId);
    }
    const result = await params.reloadPlugin(pluginId);
    params.onReloadResult?.(result);
    for (const issue of result.issues) {
      params.onDiagnostic?.(issue);
    }
    for (const step of result.steps) {
      for (const diagnostic of step.diagnostics ?? []) {
        params.onDiagnostic?.(diagnostic);
      }
    }
  };

  return {
    close: () => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    },
    flush: async (pluginId) => {
      const pluginIds = pluginId ? [pluginId] : Array.from(pending.keys());
      await Promise.all(pluginIds.map((id) => runReload(id)));
    },
    handleChangedPath: (changedPath) => {
      const resolution = resolveChangedPathPlugin({
        changedPath,
        registry: params.registry,
      });
      if ("diagnostics" in resolution) {
        for (const diagnostic of resolution.diagnostics ?? []) {
          params.onDiagnostic?.(diagnostic);
        }
      }
      if (resolution.status !== "matched") {
        return resolution;
      }

      const existing = pending.get(resolution.pluginId);
      if (existing) {
        clearTimeout(existing);
      }
      pending.set(
        resolution.pluginId,
        setTimeout(() => {
          void runReload(resolution.pluginId);
        }, debounceMs)
      );
      return resolution;
    },
  };
}

export function resolveDevPluginReloadWatchTargets(
  roots: string[]
): DevPluginReloadWatchTarget[] {
  const targets = new Map<string, DevPluginReloadWatchTarget>();

  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    targets.set(`${resolvedRoot}:false`, {
      recursive: false,
      root: resolvedRoot,
    });

    for (const segment of recursiveWatchSubdirectories) {
      const childRoot = path.join(resolvedRoot, segment);
      targets.set(`${childRoot}:true`, {
        recursive: true,
        root: childRoot,
      });
    }
  }

  return Array.from(targets.values()).sort((a, b) => {
    const rootOrder = a.root.localeCompare(b.root);
    if (rootOrder !== 0) {
      return rootOrder;
    }
    return Number(a.recursive) - Number(b.recursive);
  });
}

/** Two recursive roots instead of one fs.watch per plugin subdirectory (avoids EMFILE). */
export function resolveAggregateDevPluginReloadWatchTargets(params: {
  modulesDir: string;
  packagesDir: string;
}): DevPluginReloadWatchTarget[] {
  return [params.modulesDir, params.packagesDir].map((root) => ({
    recursive: true,
    root: path.resolve(root),
  }));
}

function createDevPluginReloadFsWatcher(params: {
  onChange: (changedPath: string) => void;
  onError?: (error: Error, target: DevPluginReloadWatchTarget) => void;
  target: DevPluginReloadWatchTarget;
}): fs.FSWatcher | null {
  try {
    const watcher = fs.watch(
      params.target.root,
      { recursive: params.target.recursive },
      (_eventType, filename) => {
        if (!filename) {
          return;
        }
        params.onChange(path.join(params.target.root, filename.toString()));
      }
    );
    watcher.on("error", (error) => {
      params.onError?.(
        error instanceof Error ? error : new Error(String(error)),
        params.target
      );
      try {
        watcher.close();
      } catch {
        // Watcher may already be invalid after EMFILE.
      }
    });
    return watcher;
  } catch (error) {
    params.onError?.(
      error instanceof Error ? error : new Error(String(error)),
      params.target
    );
    return null;
  }
}

function collectReloadWatchFileStats(
  registry: PluginRegistry
): Map<string, number> {
  const stats = new Map<string, number>();

  const addFile = (filePath: string) => {
    if (isIgnoredPath(filePath)) {
      return;
    }
    try {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        stats.set(normalizePath(filePath), stat.mtimeMs);
      }
    } catch {
      // Ignore missing paths until they appear.
    }
  };

  const walkDir = (dir: string) => {
    if (isIgnoredPath(dir)) {
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (isIgnoredPath(fullPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        addFile(fullPath);
      }
    }
  };

  for (const plugin of registry.plugins) {
    if (!plugin.loaded) {
      continue;
    }
    if (plugin.sourceType !== "module" && plugin.sourceType !== "package") {
      continue;
    }
    const root = normalizePath(plugin.rootDir);
    addFile(path.join(root, "engenty.plugin.json"));
    for (const segment of recursiveWatchSubdirectories) {
      walkDir(path.join(root, segment));
    }
  }

  return stats;
}

function startDevPluginReloadPollingWatcher(params: {
  intervalMs?: number;
  onChange: (changedPath: string) => void;
  registry: PluginRegistry;
}): { close: () => void } {
  const intervalMs = params.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let previous = collectReloadWatchFileStats(params.registry);

  const timer = setInterval(() => {
    const next = collectReloadWatchFileStats(params.registry);
    for (const [filePath, mtime] of next) {
      const prior = previous.get(filePath);
      if (prior !== undefined && prior !== mtime) {
        params.onChange(filePath);
      }
    }
    for (const filePath of previous.keys()) {
      if (!next.has(filePath)) {
        params.onChange(filePath);
      }
    }
    previous = next;
  }, intervalMs);

  return {
    close: () => clearInterval(timer),
  };
}

export function startDevPluginReloadWatcher(params: {
  debounceMs?: number;
  modulesDir?: string;
  onDiagnostic?: (diagnostic: PluginDiagnostic) => void;
  onPollingFallback?: () => void;
  onReloadResult?: (result: ReloadPluginExecutionResult) => void;
  onWatchError?: (error: Error, target: DevPluginReloadWatchTarget) => void;
  packagesDir?: string;
  pollIntervalMs?: number;
  registry: PluginRegistry;
  reloadPlugin: (pluginId: string) => Promise<ReloadPluginExecutionResult>;
  /** @deprecated Prefer `modulesDir` + `packagesDir` aggregate watch roots. */
  roots?: string[];
  watchTargets?: DevPluginReloadWatchTarget[];
}): DevPluginReloadWatcher {
  const scheduler = createDevPluginReloadScheduler(params);
  const watchTargets =
    params.watchTargets ??
    (params.modulesDir && params.packagesDir
      ? resolveAggregateDevPluginReloadWatchTargets({
          modulesDir: params.modulesDir,
          packagesDir: params.packagesDir,
        })
      : resolveDevPluginReloadWatchTargets(params.roots ?? []));
  const watchers: fs.FSWatcher[] = [];
  let pollingWatcher: { close: () => void } | undefined;
  let pollingStarted = false;

  const startPollingIfNeeded = () => {
    if (pollingStarted || watchers.length > 0) {
      return;
    }
    if (!watchTargets.some((target) => fs.existsSync(target.root))) {
      return;
    }
    pollingStarted = true;
    pollingWatcher = startDevPluginReloadPollingWatcher({
      intervalMs: params.pollIntervalMs,
      registry: params.registry,
      onChange: (changedPath) => {
        scheduler.handleChangedPath(changedPath);
      },
    });
    params.onPollingFallback?.();
  };

  for (const target of watchTargets) {
    if (!fs.existsSync(target.root)) {
      continue;
    }
    let watcher: fs.FSWatcher | null = null;
    watcher = createDevPluginReloadFsWatcher({
      target,
      onChange: (changedPath) => {
        scheduler.handleChangedPath(changedPath);
      },
      onError: (error, erroredTarget) => {
        params.onWatchError?.(error, erroredTarget);
        if (watcher) {
          const index = watchers.indexOf(watcher);
          if (index >= 0) {
            watchers.splice(index, 1);
          }
        }
        startPollingIfNeeded();
      },
    });
    if (watcher) {
      watchers.push(watcher);
    }
  }

  startPollingIfNeeded();

  return {
    close: () => {
      pollingWatcher?.close();
      for (const watcher of watchers) {
        watcher.close();
      }
      scheduler.close();
    },
    scheduler,
  };
}
