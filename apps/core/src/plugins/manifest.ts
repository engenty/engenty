import fs from "node:fs";
import path from "node:path";
import {
  isPluginCategory,
  isPluginPlacement,
  isPluginStability,
  PLUGIN_CATEGORIES,
  PLUGIN_PLACEMENTS,
  PLUGIN_STABILITIES,
  type PluginCategory,
  type PluginPlacement,
  type PluginStability,
} from "@engenty/plugin-sdk";
import { collectManifestDiagnostics } from "./manifest-diagnostics.js";

export type {
  PluginCategory,
  PluginPlacement,
  PluginStability,
} from "@engenty/plugin-sdk";
export {
  PLUGIN_CATEGORIES,
  PLUGIN_PLACEMENTS,
  PLUGIN_STABILITIES,
} from "@engenty/plugin-sdk";

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

/**
 * Parse optional `category`. Absent → undefined. Present but unknown → error
 * string for the caller to fail the load.
 */
export function resolvePluginCategory(
  value: unknown
): { ok: true; category?: PluginCategory } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (!isPluginCategory(value)) {
    return {
      ok: false,
      error: `engenty.plugin.json category must be one of: ${PLUGIN_CATEGORIES.join(", ")}`,
    };
  }
  return { ok: true, category: value };
}

/**
 * Parse optional `placement`. Absent → undefined, which the resolver reads as
 * `"space"` while emitting a diagnostic. Present but unknown → error, exactly
 * like `category`: a typo'd placement must not degrade to a default, because
 * the default it would land on decides whether the module appears on the rail.
 */
export function resolvePluginPlacement(
  value: unknown
): { ok: true; placement?: PluginPlacement } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (!isPluginPlacement(value)) {
    return {
      ok: false,
      error: `engenty.plugin.json placement must be one of: ${PLUGIN_PLACEMENTS.join(", ")}`,
    };
  }
  return { ok: true, placement: value };
}

/**
 * Parse optional `stability`. Absent → undefined, read as stable. Unknown →
 * error, like `category`: a typo must not quietly promote a half-built module
 * into the README.
 */
export function resolvePluginStability(
  value: unknown
): { ok: true; stability?: PluginStability } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (!isPluginStability(value)) {
    return {
      ok: false,
      error: `engenty.plugin.json stability must be one of: ${PLUGIN_STABILITIES.join(", ")}`,
    };
  }
  return { ok: true, stability: value };
}

const CONNECTION_NEED_CAPABILITIES = new Set(["files", "storage", "stream"]);

/**
 * Read `connections: [{ capability, required? }]`.
 *
 * Unknown capabilities are dropped rather than rejected: a module built against
 * a newer SDK must still load on an older host, and a need nobody understands
 * is a need nobody can satisfy — silently demanding one would make the module
 * unmountable.
 */
export function readConnectionNeeds(
  value: unknown
): PluginManifestConnectionNeed[] | undefined {
  if (!Array.isArray(value)) {
    return;
  }
  const needs: PluginManifestConnectionNeed[] = [];
  for (const entry of value) {
    const capability = (entry as { capability?: unknown })?.capability;
    if (typeof capability !== "string") {
      continue;
    }
    if (!CONNECTION_NEED_CAPABILITIES.has(capability)) {
      continue;
    }
    const required = (entry as { required?: unknown })?.required;
    const bindOperation = (entry as { bindOperation?: unknown })?.bindOperation;
    needs.push({
      capability: capability as PluginManifestConnectionNeed["capability"],
      ...(typeof bindOperation === "string" && bindOperation.trim()
        ? { bindOperation: bindOperation.trim() }
        : {}),
      ...(required === false ? { required: false } : {}),
    });
  }
  return needs.length > 0 ? needs : undefined;
}

export interface PluginManifestCapabilityFlags {
  ai?: boolean;
  frontendTools?: boolean;
  operations?: boolean;
  ui?: boolean;
}

/**
 * An external account this module needs to do its job, named by the CONNECTOR
 * CAPABILITY it must provide (`ConnectorDefinition.stream` / `.files` /
 * `.storage`) rather than by a connector — Inbox needs a mailbox to pull from,
 * not Gmail specifically.
 *
 * This is what lets one flow know that "add Inbox to this space" is an
 * unfinished sentence until a mailbox is placed here too
 * (PLAN-connections-ux.md B3).
 */
export interface PluginManifestConnectionNeed {
  /**
   * The module operation that makes an account USABLE here
   * (PLAN-connections-ux.md B3b) — called with `{ connection_id, space_id }`
   * when this module and a matching account end up in the same space. A
   * module whose binding is tenant-wide (a mailbox's sync state) ignores the
   * space; one whose binding is per space (a drive's folder in this space's
   * Files) needs it.
   *
   * Without it, placing a mailbox and adding Inbox leaves two rows and no
   * mail: the module's own binding (a sync state row, a file source) is the
   * step that turns availability into something that works. Idempotent by
   * contract — it runs again whenever either side is re-added.
   */
  bindOperation?: string;
  capability: "files" | "storage" | "stream";
  /** Absent ⇒ required. An optional need is offered, never demanded. */
  required?: boolean;
}

export interface PluginManifest {
  capabilities?: PluginManifestCapabilityFlags;
  /** Catalog group — see {@link PluginCategory}. */
  category?: PluginCategory;
  /** External accounts this module needs — see {@link PluginManifestConnectionNeed}. */
  connections?: PluginManifestConnectionNeed[];
  description?: string;
  /** One emoji for catalogs and the README module table. */
  emoji?: string;
  id: string;
  kind?: string;
  /**
   * The module operation that makes a fresh mount USABLE in a space — called
   * with `{ space_id }` by every path that mounts the module (the create
   * wizard, the space's setup dialog, the `space_setup` tool). A module whose
   * pages need a row to exist first (the space's knowledge base) creates it
   * here; one that is ready as soon as it is mounted declares nothing.
   *
   * Idempotent by contract: it runs again on every re-add, which is also how a
   * setup that could not finish is retried. A failure never fails the mount —
   * the placement stands and the caller is told which app is not ready.
   */
  mountOperation?: string;
  name?: string;
  optional?: string[];
  /** Shell placement — see {@link PluginPlacement}. Absent ⇒ treated as "space". */
  placement?: PluginPlacement;
  provides?: string[];
  requires?: string[];
  server?: {
    entry: string;
  };
  /** See {@link PluginStability}. Absent ⇒ stable. */
  stability?: PluginStability;
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
    const modulesDir = path.basename(
      path.dirname(path.dirname(path.dirname(abs)))
    );
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
  const categoryResult = resolvePluginCategory(merged.category);
  if (!categoryResult.ok) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error: categoryResult.error,
      manifestPath,
    };
  }
  const placementResult = resolvePluginPlacement(merged.placement);
  if (!placementResult.ok) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error: placementResult.error,
      manifestPath,
    };
  }
  const stabilityResult = resolvePluginStability(merged.stability);
  if (!stabilityResult.ok) {
    return {
      ok: false,
      code: "plugin.manifest.invalid",
      error: stabilityResult.error,
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
    category: categoryResult.category,
    placement: placementResult.placement,
    stability: stabilityResult.stability,
    ...(typeof merged.emoji === "string" && merged.emoji.trim()
      ? { emoji: merged.emoji.trim() }
      : {}),
    tier: resolvePluginTier(merged.tier),
    server,
    ui,
    provides: readStringArray(merged.provides),
    requires: readStringArray(merged.requires),
    optional: readStringArray(merged.optional),
    capabilities: readCapabilityFlags(merged.capabilities),
    connections: readConnectionNeeds(merged.connections),
    ...(typeof merged.mountOperation === "string" &&
    merged.mountOperation.trim()
      ? { mountOperation: merged.mountOperation.trim() }
      : {}),
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
