import fs from "node:fs";
import path from "node:path";
import { collectManifestDiagnostics } from "./manifest-diagnostics.js";

export const ENGENTY_PLUGIN_MANIFEST_FILENAME = "engenty.plugin.json";

export type PluginManifestUiLoadMode = "runtime" | "workspace";

/**
 * Plugin tier (see docs/content/dev/plugins/plugin-tiers.md):
 * - "module": deeply-integrated, build-time, trusted. No capability ceiling.
 * - "plugin": catalog-installed, runtime, lower-trust. Restricted surfaces.
 * Distinct from `kind` (source location) and from install-time trust levels.
 */
export type PluginTier = "module" | "plugin";

export const DEFAULT_PLUGIN_TIER: PluginTier = "module";

/** Normalize a raw manifest `tier` value, defaulting to "module". */
export function resolvePluginTier(value: unknown): PluginTier {
  return value === "plugin" ? "plugin" : DEFAULT_PLUGIN_TIER;
}

export interface PluginManifestCapabilityFlags {
  ai?: boolean;
  frontendTools?: boolean;
  operations?: boolean;
  ui?: boolean;
}

export interface PluginManifest {
  capabilities?: PluginManifestCapabilityFlags;
  description?: string;
  id: string;
  kind?: string;
  name?: string;
  optional?: string[];
  provides?: string[];
  requires?: string[];
  server?: {
    entry: string;
  };
  tier?: PluginTier;
  ui?: {
    assetOrigins?: string[];
    enabled?: boolean;
    entry: string;
    export?: string;
    load?: PluginManifestUiLoadMode;
    staticAssets?: string[];
    tailwindSources?: string[];
  };
  version?: string;
}

export interface PluginManifestDiagnostic {
  code: "plugin.manifest.version_mismatch";
  level: "warn";
  message: string;
}

export type PluginManifestLoadResult =
  | {
      diagnostics: PluginManifestDiagnostic[];
      ok: true;
      manifest: PluginManifest;
      manifestPath: string;
    }
  | {
      ok: false;
      code: "plugin.manifest.invalid" | "plugin.manifest.missing";
      error: string;
      manifestPath: string;
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function resolveEngentyPluginManifestPath(rootDir: string): string {
  return path.join(rootDir, ENGENTY_PLUGIN_MANIFEST_FILENAME);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : [];
}

function readCapabilityFlags(
  value: unknown
): PluginManifestCapabilityFlags | undefined {
  if (!isRecord(value)) {
    return;
  }
  return {
    ai: typeof value.ai === "boolean" ? value.ai : undefined,
    frontendTools:
      typeof value.frontendTools === "boolean"
        ? value.frontendTools
        : undefined,
    operations:
      typeof value.operations === "boolean" ? value.operations : undefined,
    ui: typeof value.ui === "boolean" ? value.ui : undefined,
  };
}

function readPackageJson(rootDir: string): Record<string, unknown> | undefined {
  const p = path.join(rootDir, "package.json");
  if (!fs.existsSync(p)) {
    return;
  }
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(p, "utf-8"));
    return isRecord(raw) ? raw : undefined;
  } catch {
    return;
  }
}

export function isConventionalPluginRoot(rootDir: string): boolean {
  const abs = path.resolve(rootDir);
  const parent = path.basename(path.dirname(abs));
  if (parent === "modules" || parent === "packages") {
    return true;
  }
  // Nested connector providers: modules/<parent>/providers/<child>
  if (parent === "providers") {
    const modulesDir = path.basename(path.dirname(path.dirname(path.dirname(abs))));
    return modulesDir === "modules";
  }
  return false;
}

function derivePluginIdFromRoot(rootDir: string): string | undefined {
  const base = path.basename(path.resolve(rootDir));
  return base.trim() || undefined;
}

export function resolveDefaultServerEntry(rootDir: string): string | undefined {
  const candidates = [
    path.join(rootDir, "src", "plugin.ts"),
    path.join(rootDir, "src", "plugin.mts"),
    path.join(rootDir, "src", "plugin.cts"),
    path.join(rootDir, "src", "plugin.js"),
    path.join(rootDir, "index.ts"),
    path.join(rootDir, "index.mts"),
    path.join(rootDir, "index.js"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      if (filePath.endsWith(`${path.sep}src${path.sep}plugin.ts`)) {
        return "./src/plugin.ts";
      }
      if (filePath.endsWith(`${path.sep}src${path.sep}plugin.mts`)) {
        return "./src/plugin.mts";
      }
      if (filePath.endsWith(`${path.sep}src${path.sep}plugin.cts`)) {
        return "./src/plugin.cts";
      }
      if (filePath.endsWith(`${path.sep}src${path.sep}plugin.js`)) {
        return "./src/plugin.js";
      }
      if (filePath.endsWith(`${path.sep}index.ts`)) {
        return "./index.ts";
      }
      if (filePath.endsWith(`${path.sep}index.mts`)) {
        return "./index.mts";
      }
      if (filePath.endsWith(`${path.sep}index.js`)) {
        return "./index.js";
      }
    }
  }
  return;
}

/**
 * When `ui.tailwindSources` is omitted or empty after merge, infer Tailwind
 * `@source` roots for conventional workspace plugins:
 * - `./ui` when that directory exists (typical `modules/*`).
 * - `./src` only under `packages/*` when `./ui` is missing but `./src` exists
 *   (package plugins such as `@engenty/auth-ui` often declare `./src`/`./dist`
 *   explicitly — this default avoids forcing noisy JSON for simple layouts).
 */
export function resolveDefaultTailwindSources(
  rootDir: string
): string[] | undefined {
  if (!isConventionalPluginRoot(rootDir)) {
    return;
  }
  const uiDir = path.join(rootDir, "ui");
  if (fs.existsSync(uiDir) && fs.statSync(uiDir).isDirectory()) {
    return ["./ui"];
  }
  const parent = path.basename(path.dirname(path.resolve(rootDir)));
  if (parent === "packages") {
    const srcDir = path.join(rootDir, "src");
    if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
      return ["./src"];
    }
  }
  return;
}

function resolveDefaultUiEntry(params: {
  packageName?: string;
  rootDir: string;
}): string | undefined {
  if (!isConventionalPluginRoot(params.rootDir)) {
    return;
  }
  const candidates = [
    path.join(params.rootDir, "ui", "plugin.ts"),
    path.join(params.rootDir, "ui", "plugin.mts"),
    path.join(params.rootDir, "ui", "plugin.js"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const packageName = params.packageName?.trim();
      if (packageName) {
        return `${packageName}/ui/plugin`;
      }
      if (filePath.endsWith(`${path.sep}ui${path.sep}plugin.ts`)) {
        return "./ui/plugin.ts";
      }
      if (filePath.endsWith(`${path.sep}ui${path.sep}plugin.mts`)) {
        return "./ui/plugin.mts";
      }
      if (filePath.endsWith(`${path.sep}ui${path.sep}plugin.js`)) {
        return "./ui/plugin.js";
      }
    }
  }
  return;
}

function buildConventionRawManifest(
  rootDir: string
): Record<string, unknown> | undefined {
  if (!isConventionalPluginRoot(rootDir)) {
    return;
  }
  const pkg = readPackageJson(rootDir);
  if (!pkg) {
    return;
  }
  const id = derivePluginIdFromRoot(rootDir);
  if (!id) {
    return;
  }
  const serverEntry = resolveDefaultServerEntry(rootDir);
  if (!serverEntry) {
    return;
  }
  const name =
    typeof pkg.name === "string" && pkg.name.trim() ? pkg.name.trim() : id;
  const description =
    typeof pkg.description === "string" && pkg.description.trim()
      ? pkg.description.trim()
      : undefined;
  const version =
    typeof pkg.version === "string" && pkg.version.trim()
      ? pkg.version.trim()
      : undefined;
  const uiEntry = resolveDefaultUiEntry({
    packageName: typeof pkg.name === "string" ? pkg.name : undefined,
    rootDir,
  });
  return {
    description,
    id,
    name,
    server: {
      entry: serverEntry,
    },
    ...(uiEntry
      ? {
          capabilities: { ui: true },
          ui: {
            entry: uiEntry,
            export: "default",
            load: "workspace",
          },
        }
      : {}),
    version,
  };
}

function mergeRawWithConventionDefaults(
  rootDir: string,
  raw: Record<string, unknown>
): Record<string, unknown> {
  const convention = buildConventionRawManifest(rootDir);
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : convention?.id;
  const serverRaw = isRecord(raw.server) ? raw.server : undefined;
  const serverEntry =
    typeof serverRaw?.entry === "string" && serverRaw.entry.trim()
      ? serverRaw.entry.trim()
      : typeof convention?.server === "object" &&
          convention.server !== null &&
          isRecord(convention.server) &&
          typeof convention.server.entry === "string"
        ? convention.server.entry
        : "";
  const server = serverEntry
    ? {
        entry: serverEntry,
      }
    : undefined;
  const uiRaw = isRecord(raw.ui) ? raw.ui : undefined;
  const conventionUi = isRecord(convention?.ui) ? convention.ui : undefined;
  const uiEntry =
    typeof uiRaw?.entry === "string" && uiRaw.entry.trim()
      ? uiRaw.entry.trim()
      : typeof conventionUi?.entry === "string"
        ? conventionUi.entry
        : "";
  const explicitTailwindSources = readStringArray(uiRaw?.tailwindSources);
  const resolvedTailwindSources =
    explicitTailwindSources && explicitTailwindSources.length > 0
      ? explicitTailwindSources
      : resolveDefaultTailwindSources(rootDir);
  const staticAssets = readStringArray(uiRaw?.staticAssets);
  const assetOrigins = readStringArray(uiRaw?.assetOrigins);
  const ui = uiEntry
    ? {
        entry: uiEntry,
        enabled:
          typeof uiRaw?.enabled === "boolean" ? uiRaw.enabled : undefined,
        export:
          typeof uiRaw?.export === "string" && uiRaw.export.trim()
            ? uiRaw.export.trim()
            : "default",
        load:
          uiRaw?.load === "runtime" || uiRaw?.load === "workspace"
            ? uiRaw.load
            : typeof conventionUi?.load === "string"
              ? conventionUi.load
              : "runtime",
        ...(resolvedTailwindSources && resolvedTailwindSources.length > 0
          ? { tailwindSources: resolvedTailwindSources }
          : {}),
        ...(staticAssets ? { staticAssets } : {}),
        ...(assetOrigins ? { assetOrigins } : {}),
      }
    : undefined;
  const rawCapabilities = readCapabilityFlags(raw.capabilities);
  const capabilities =
    ui && rawCapabilities?.ui === undefined
      ? { ...(rawCapabilities ?? {}), ui: true }
      : rawCapabilities;
  return {
    ...raw,
    ...(id ? { id } : {}),
    ...(server ? { server } : {}),
    ...(ui ? { ui } : {}),
    ...(capabilities ? { capabilities } : {}),
  };
}

export function loadPluginManifest(rootDir: string): PluginManifestLoadResult {
  const manifestPath = resolveEngentyPluginManifestPath(rootDir);
  const fileExists = fs.existsSync(manifestPath);
  let raw: unknown;
  if (fileExists) {
    try {
      raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch (err) {
      return {
        ok: false,
        code: "plugin.manifest.invalid",
        error: `failed to parse engenty.plugin.json: ${String(err)}`,
        manifestPath,
      };
    }
  } else {
    const derived = buildConventionRawManifest(rootDir);
    if (!derived) {
      return {
        ok: false,
        code: "plugin.manifest.missing",
        error: `plugin manifest not found: ${manifestPath}`,
        manifestPath,
      };
    }
    raw = derived;
  }
  if (!isRecord(raw)) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error: "engenty.plugin.json must be an object",
      manifestPath,
    };
  }
  const merged = mergeRawWithConventionDefaults(rootDir, raw);
  const id =
    typeof merged.id === "string" && merged.id.trim() ? merged.id.trim() : "";
  if (!id) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error:
        "engenty.plugin.json requires id (or use a conventional modules/* or packages/* layout so the host can derive it)",
      manifestPath,
    };
  }
  const uiRaw = isRecord(merged.ui) ? merged.ui : undefined;
  const uiEntry = typeof uiRaw?.entry === "string" ? uiRaw.entry.trim() : "";
  const uiLoad: PluginManifestUiLoadMode =
    uiRaw?.load === "runtime" || uiRaw?.load === "workspace"
      ? uiRaw.load
      : "runtime";
  const ui = uiEntry
    ? {
        entry: uiEntry,
        enabled:
          typeof uiRaw?.enabled === "boolean" ? uiRaw.enabled : undefined,
        export:
          typeof uiRaw?.export === "string" ? uiRaw.export.trim() : undefined,
        load: uiLoad,
        staticAssets: readStringArray(uiRaw?.staticAssets),
        assetOrigins: readStringArray(uiRaw?.assetOrigins),
        tailwindSources: readStringArray(uiRaw?.tailwindSources),
      }
    : undefined;
  const serverRaw = isRecord(merged.server) ? merged.server : undefined;
  const serverEntry =
    typeof serverRaw?.entry === "string" ? serverRaw.entry.trim() : "";
  const server = serverEntry
    ? {
        entry: serverEntry,
      }
    : undefined;
  if (!(server?.entry || ui?.entry)) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error: "engenty.plugin.json requires server.entry or ui.entry",
      manifestPath,
    };
  }
  const manifest: PluginManifest = {
    id,
    name: typeof merged.name === "string" ? merged.name.trim() : undefined,
    description:
      typeof merged.description === "string"
        ? merged.description.trim()
        : undefined,
    version:
      typeof merged.version === "string" ? merged.version.trim() : undefined,
    kind: typeof merged.kind === "string" ? merged.kind.trim() : undefined,
    tier: resolvePluginTier(merged.tier),
    server,
    ui,
    provides: readStringArray(merged.provides),
    requires: readStringArray(merged.requires),
    optional: readStringArray(merged.optional),
    capabilities: readCapabilityFlags(merged.capabilities),
  };
  const diagnostics: PluginManifestDiagnostic[] = [];
  collectManifestDiagnostics({
    diagnostics,
    manifest,
    rootDir,
  });

  return {
    diagnostics,
    ok: true,
    manifest,
    manifestPath,
  };
}
