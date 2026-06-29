import fs from "node:fs";
import path from "node:path";
import { enabledModuleSlugSetFromDir } from "@engenty/environment";
import {
  ENGENTY_PLUGIN_MANIFEST_FILENAME,
  isConventionalPluginRoot,
  resolveDefaultServerEntry,
} from "./manifest.js";

const PLUGIN_SOURCE_EXTS = new Set([
  ".ts",
  ".js",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

export interface PluginCandidate {
  idHint: string;
  packageName?: string;
  rootDir: string;
  source: string;
  sourceType: "module" | "package";
}

export interface PluginDiscoveryResult {
  candidates: PluginCandidate[];
}

function isPluginSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath);
  return PLUGIN_SOURCE_EXTS.has(ext) && !filePath.endsWith(".d.ts");
}

function readPackageJson(dir: string): { name?: string } | null {
  const p = path.join(dir, "package.json");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function readJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function resolvePlugins(
  rootDir: string,
  sourceType: PluginCandidate["sourceType"]
): string[] {
  const manifestPath = path.join(rootDir, ENGENTY_PLUGIN_MANIFEST_FILENAME);
  const manifestExists = fs.existsSync(manifestPath);
  const moduleManifest = manifestExists ? readJson(manifestPath) : null;
  const server =
    typeof moduleManifest?.server === "object" &&
    moduleManifest.server !== null &&
    !Array.isArray(moduleManifest.server)
      ? (moduleManifest.server as Record<string, unknown>)
      : null;
  const serverEntry =
    typeof server?.entry === "string" ? server.entry.trim() : "";
  if (serverEntry) {
    return [serverEntry];
  }

  if (!isConventionalPluginRoot(rootDir)) {
    return sourceType === "package"
      ? []
      : ["index.ts", "index.js", "index.mts", "index.mjs"];
  }

  const derived = resolveDefaultServerEntry(rootDir);
  if (derived) {
    if (sourceType === "package" && !manifestExists) {
      return [];
    }
    return [derived];
  }

  if (sourceType === "package") {
    return [];
  }
  return ["index.ts", "index.js", "index.mts", "index.mjs"];
}

function discoverFromRoot(params: {
  enabledModuleSlugs?: Set<string>;
  rootDir: string;
  seen: Set<string>;
  sourceType: PluginCandidate["sourceType"];
}): PluginCandidate[] {
  const candidates: PluginCandidate[] = [];
  const rootDir = path.resolve(params.rootDir);
  if (!(fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory())) {
    return candidates;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    if (
      params.sourceType === "module" &&
      params.enabledModuleSlugs &&
      !params.enabledModuleSlugs.has(ent.name)
    ) {
      continue;
    }
    const moduleDir = path.join(rootDir, ent.name);
    const candidate = discoverPluginPackageRoot({
      rootDir: moduleDir,
      sourceType: params.sourceType,
    });
    if (!candidate) {
      continue;
    }
    if (params.seen.has(candidate.source)) {
      continue;
    }
    params.seen.add(candidate.source);
    candidates.push(candidate);
  }

  return candidates;
}

export function discoverPluginPackageRoot(params: {
  rootDir: string;
  sourceType: PluginCandidate["sourceType"];
}): PluginCandidate | undefined {
  const rootDir = path.resolve(params.rootDir);
  if (!(fs.existsSync(rootDir) && fs.statSync(rootDir).isDirectory())) {
    return;
  }
  const pkg = readPackageJson(rootDir);
  if (!pkg) {
    return;
  }

  const pluginEntryPaths = resolvePlugins(rootDir, params.sourceType);
  for (const rel of pluginEntryPaths) {
    const fullPath = path.resolve(rootDir, rel);
    if (!(fs.existsSync(fullPath) && fs.statSync(fullPath).isFile())) {
      continue;
    }
    if (!isPluginSourceFile(fullPath)) {
      continue;
    }

    const unscoped = (pkg.name ?? path.basename(rootDir)).split("/").pop();
    return {
      idHint: unscoped ?? path.basename(rootDir),
      source: path.resolve(fullPath),
      rootDir,
      sourceType: params.sourceType,
      packageName: pkg.name,
    };
  }
}

export function discoverPlugins(params: {
  modulesDir: string;
  packagesDir?: string;
}): PluginDiscoveryResult {
  const candidates: PluginCandidate[] = [];
  const modulesDir = path.resolve(params.modulesDir);
  const seen = new Set<string>();
  let enabledModuleSlugs: Set<string> | undefined;
  try {
    enabledModuleSlugs = enabledModuleSlugSetFromDir(modulesDir);
  } catch {
    enabledModuleSlugs = undefined;
  }
  candidates.push(
    ...discoverFromRoot({
      rootDir: modulesDir,
      sourceType: "module",
      seen,
      enabledModuleSlugs,
    })
  );
  if (params.packagesDir) {
    candidates.push(
      ...discoverFromRoot({
        rootDir: params.packagesDir,
        sourceType: "package",
        seen,
      })
    );
  }

  return { candidates };
}

export function resolveModulesDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "modules"),
    path.resolve(cwd, "../../modules"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }
  return path.resolve(cwd, "modules");
}

export function resolvePackagesDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, "packages"),
    path.resolve(cwd, "../../packages"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  }
  return path.resolve(cwd, "packages");
}
