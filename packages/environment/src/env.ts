import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadDotEnv(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    let line = lines[i].trim();
    i++;

    if (!line || line.startsWith("#")) {
      continue;
    }
    if (line.startsWith("export ")) {
      line = line.slice(7).trim();
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    const quote = value[0];
    if ((quote === '"' || quote === "'") && !value.endsWith(quote)) {
      const parts = [value.slice(1)];
      while (i < lines.length) {
        const nextLine = lines[i];
        i++;
        if (nextLine.trimEnd().endsWith(quote)) {
          parts.push(nextLine.trimEnd().slice(0, -1));
          break;
        }
        parts.push(nextLine);
      }
      value = parts.join("\n");
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }
  return out;
}

/** Walk up from `dir` to find `pnpm-workspace.yaml`; returns `dir` if not found. */
export function findWorkspaceRootFrom(dir: string): string {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return dir;
}

/**
 * Merge dotenv layers: **package** `packageRoot` `.env*` first, then **workspace root**
 * `.env*` so repo-root `.env.local` wins when pnpm runs with cwd inside a package.
 */
export function mergeWorkspaceDotEnvLayers(
  workspaceRoot: string,
  packageRoot: string
): Record<string, string> {
  return {
    ...loadDotEnv(path.join(packageRoot, ".env")),
    ...loadDotEnv(path.join(packageRoot, ".env.local")),
    ...loadDotEnv(path.join(workspaceRoot, ".env")),
    ...loadDotEnv(path.join(workspaceRoot, ".env.local")),
  };
}

/** Apply merged layers into `process.env` without overwriting existing non-empty values. */
export function applyWorkspaceDotEnvLayers(
  workspaceRoot: string,
  packageRoot: string
) {
  const envValues = mergeWorkspaceDotEnvLayers(workspaceRoot, packageRoot);
  for (const [key, value] of Object.entries(envValues)) {
    const current = process.env[key];
    const missingOrEmpty = current == null || String(current).trim() === "";
    if (missingOrEmpty) {
      process.env[key] = value;
    }
  }
}

/**
 * Convenience: resolve `workspaceRoot` by walking up from `packageRoot`, then apply layers.
 * Prefer {@link applyWorkspaceDotEnvLayers} when the workspace root must be anchored elsewhere
 * (e.g. `apps/core` tests loading a temp package dir but still merging repo-root `.env`).
 */
export function loadWorkspaceDotEnvIntoProcess(packageRoot = process.cwd()) {
  const workspaceRoot = findWorkspaceRootFrom(packageRoot);
  applyWorkspaceDotEnvLayers(workspaceRoot, packageRoot);
}

/** Resolve monorepo workspace root when loading env for a host app (e.g. `apps/core`). */
export function resolveHostWorkspaceRoot(hostPackageRoot: string): string {
  const fromHost = findWorkspaceRootFrom(hostPackageRoot);
  if (fromHost !== hostPackageRoot) {
    return fromHost;
  }
  return findWorkspaceRootFrom(process.cwd());
}

export interface LoadCoreRuntimeEnvOptions {
  /**
   * Absolute path to the host app package root (e.g. `.../apps/core` — the folder with `package.json`).
   * Used to locate the monorepo root when `pnpm` runs with cwd inside that package.
   */
  hostPackageRoot: string;
  /** Directory whose `.env*` files are merged (default `process.cwd()`). */
  rootDir?: string;
}

/**
 * Merge dotenv layers for the **core API** (and similar) process: `rootDir` package files first,
 * then workspace root. Pass `hostPackageRoot` as the `apps/core` directory (see call sites).
 */
export function loadCoreRuntimeEnv(options: LoadCoreRuntimeEnvOptions) {
  const rootDir = options.rootDir ?? process.cwd();
  const workspaceRoot = resolveHostWorkspaceRoot(options.hostPackageRoot);
  applyWorkspaceDotEnvLayers(workspaceRoot, rootDir);
}

/** Convenience: `hostPackageRoot` = directory containing the caller’s file’s `src/` parent (e.g. from `api-entry.ts` → `apps/core`). */
export function loadCoreRuntimeEnvFromCallerSrcDir(
  callerImportMetaUrl: string | URL
) {
  const hostPackageRoot = path.resolve(
    path.dirname(fileURLToPath(callerImportMetaUrl)),
    ".."
  );
  loadCoreRuntimeEnv({ hostPackageRoot });
}

export function envString(
  config: Record<string, unknown>,
  configKey: string,
  envKey: string,
  fallback = ""
): string {
  return String(config[configKey] ?? process.env[envKey] ?? fallback);
}

export function envBoolean(
  config: Record<string, unknown>,
  configKey: string,
  envKey: string,
  fallback = false
): boolean {
  const raw = config[configKey] ?? process.env[envKey];
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    return raw === "true";
  }
  return fallback;
}

export function envNumber(
  config: Record<string, unknown>,
  configKey: string,
  envKey: string,
  fallback: number
): number {
  const raw = config[configKey] ?? process.env[envKey];
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}
