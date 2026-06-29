import fs from "node:fs";
import path from "node:path";

export const ENGENTY_PLUGIN_MANIFEST = "engenty.plugin.json";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface EngentyPluginSpec {
  config: Record<string, unknown>;
  slug: string;
  source: string;
}

/** @deprecated Use EngentyPluginsManifest */
export type EngentyModulesManifest = EngentyPluginsManifest;

export interface EngentyPluginsManifest {
  plugins: Record<string, EngentyPluginSpec>;
  repoRoot: string;
  slugs: string[];
}

export interface ResolvedEngentyModule {
  dir: string;
  hasUi: boolean;
  manifest: Record<string, unknown>;
  packageName: string;
  slug: string;
  source: string;
}

export function modulePackageName(slug: string): string {
  return `@engenty/${slug}`;
}

export function readRootPackageJson(repoRoot: string): Record<string, unknown> {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Missing ${pkgPath}`);
  }
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<
    string,
    unknown
  >;
}

function parsePluginSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new Error("engenty.plugins contains an empty slug key");
  }
  if (!SLUG_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid engenty.plugins slug "${trimmed}" — use kebab-case (e.g. company-profile)`
    );
  }
  return trimmed;
}

function parsePluginEntry(
  slug: string,
  value: unknown
): EngentyPluginSpec {
  if (value === "workspace") {
    return { slug, source: "workspace", config: {} };
  }
  if (
    value === undefined ||
    value === null ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0)
  ) {
    return { slug, source: "workspace", config: {} };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const source =
      typeof record.source === "string" && record.source.trim().length > 0
        ? record.source.trim()
        : "workspace";
    const { source: _source, ...config } = record;
    return { slug, source, config };
  }
  throw new Error(
    `engenty.plugins.${slug} must be "workspace", {}, or { "source": "..." }`
  );
}

function readLegacyModulesArray(
  engenty: Record<string, unknown>
): Record<string, EngentyPluginSpec> | null {
  const raw = engenty.modules;
  if (!Array.isArray(raw)) {
    return null;
  }
  const plugins: Record<string, EngentyPluginSpec> = {};
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new Error("Legacy engenty.modules entries must be slug strings");
    }
    const slug = parsePluginSlug(entry);
    plugins[slug] = parsePluginEntry(slug, {});
  }
  return plugins;
}

export function readEngentyPluginsManifest(
  repoRoot: string
): EngentyPluginsManifest {
  const pkg = readRootPackageJson(repoRoot);
  const engenty =
    pkg.engenty && typeof pkg.engenty === "object" && !Array.isArray(pkg.engenty)
      ? (pkg.engenty as Record<string, unknown>)
      : {};

  let rawPlugins: Record<string, unknown> | null = null;
  if (
    engenty.plugins &&
    typeof engenty.plugins === "object" &&
    !Array.isArray(engenty.plugins)
  ) {
    rawPlugins = engenty.plugins as Record<string, unknown>;
  } else if (Array.isArray(engenty.plugins)) {
    throw new Error(
      "engenty.plugins must be an object map — use { \"my-plugin\": { \"source\": \"workspace\" } }"
    );
  } else {
    rawPlugins = readLegacyModulesArray(engenty) ?? {};
  }

  const plugins: Record<string, EngentyPluginSpec> = {};
  const slugs: string[] = [];
  for (const [rawSlug, value] of Object.entries(rawPlugins)) {
    const slug = parsePluginSlug(rawSlug);
    if (Object.hasOwn(plugins, slug)) {
      throw new Error(`Duplicate engenty.plugins slug: ${slug}`);
    }
    plugins[slug] = parsePluginEntry(slug, value);
    slugs.push(slug);
  }

  return { plugins, slugs, repoRoot };
}

/** @deprecated Use readEngentyPluginsManifest */
export function readEngentyModulesManifest(
  repoRoot: string
): EngentyPluginsManifest {
  return readEngentyPluginsManifest(repoRoot);
}

export function readEngentyPluginsManifestFromCwd(
  startDir = process.cwd()
): EngentyPluginsManifest {
  const repoRoot = findEngentyRepoRootFrom(startDir);
  return readEngentyPluginsManifest(repoRoot);
}

/** @deprecated Use readEngentyPluginsManifestFromCwd */
export function readEngentyModulesManifestFromCwd(
  startDir = process.cwd()
): EngentyPluginsManifest {
  return readEngentyPluginsManifestFromCwd(startDir);
}

export function findEngentyRepoRootFrom(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
          workspaces?: unknown;
        };
        if (
          Array.isArray(pkg.workspaces) &&
          pkg.workspaces.includes("modules/*")
        ) {
          return dir;
        }
      } catch {
        // ignore
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return path.resolve(startDir);
}

export function resolveModuleDir(repoRoot: string, slug: string): string {
  return path.join(repoRoot, "modules", slug);
}

export function listWorkspaceModuleSlugsOnDisk(repoRoot: string): string[] {
  const modulesDir = path.join(repoRoot, "modules");
  if (!fs.existsSync(modulesDir)) {
    return [];
  }
  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) =>
      fs.existsSync(path.join(modulesDir, slug, ENGENTY_PLUGIN_MANIFEST))
    )
    .sort();
}

export function readPluginManifest(
  moduleDir: string
): Record<string, unknown> | null {
  const manifestPath = path.join(moduleDir, ENGENTY_PLUGIN_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

export function moduleHasUi(manifest: Record<string, unknown> | null): boolean {
  if (!manifest) {
    return false;
  }
  const ui = manifest.ui;
  if (ui === true) {
    return true;
  }
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
    return false;
  }
  const entry = (ui as { entry?: unknown }).entry;
  return typeof entry === "string" && entry.trim().length > 0;
}

export function resolveEnabledModules(
  repoRoot: string,
  options: { strict?: boolean } = {}
): ResolvedEngentyModule[] {
  const { plugins, slugs } = readEngentyPluginsManifest(repoRoot);
  const strict = options.strict !== false;
  const modules: ResolvedEngentyModule[] = [];

  for (const slug of slugs) {
    const spec = plugins[slug];
    if (!spec) {
      continue;
    }
    if (spec.source !== "workspace") {
      if (strict) {
        throw new Error(
          `engenty.plugins.${slug} uses source "${spec.source}" — only workspace plugins are supported in v1`
        );
      }
      continue;
    }
    const dir = resolveModuleDir(repoRoot, slug);
    if (!fs.existsSync(dir)) {
      if (strict) {
        throw new Error(
          `engenty.plugins lists "${slug}" but modules/${slug}/ is missing on disk`
        );
      }
      continue;
    }
    const manifest = readPluginManifest(dir);
    if (!manifest) {
      if (strict) {
        throw new Error(
          `modules/${slug}/ is missing ${ENGENTY_PLUGIN_MANIFEST}`
        );
      }
      continue;
    }
    modules.push({
      slug,
      dir,
      packageName: modulePackageName(slug),
      manifest,
      hasUi: moduleHasUi(manifest),
      source: spec.source,
    });
  }

  return modules;
}

export function enabledModuleSlugSet(repoRoot: string): Set<string> {
  return new Set(readEngentyPluginsManifest(repoRoot).slugs);
}

export function enabledModuleSlugSetFromDir(startDir: string): Set<string> {
  return enabledModuleSlugSet(findEngentyRepoRootFrom(startDir));
}

export function isEnabledModuleSlug(repoRoot: string, slug: string): boolean {
  return enabledModuleSlugSet(repoRoot).has(slug);
}

function serializePluginEntry(spec: EngentyPluginSpec): Record<string, unknown> {
  if (spec.source === "workspace" && Object.keys(spec.config).length === 0) {
    return { source: "workspace" };
  }
  return { source: spec.source, ...spec.config };
}

export function writeEngentyPluginsManifest(
  repoRoot: string,
  slugs: string[]
): void {
  const plugins: Record<string, Record<string, unknown>> = {};
  for (const rawSlug of slugs) {
    const slug = parsePluginSlug(rawSlug);
    plugins[slug] = { source: "workspace" };
  }
  writeEngentyPluginsObject(repoRoot, plugins);
}

/** @deprecated Use writeEngentyPluginsManifest */
export function writeEngentyModulesManifest(
  repoRoot: string,
  slugs: string[]
): void {
  writeEngentyPluginsManifest(repoRoot, slugs);
}

export function writeEngentyPluginsObject(
  repoRoot: string,
  plugins: Record<string, Record<string, unknown> | string>
): void {
  const pkg = readRootPackageJson(repoRoot);
  const engenty =
    pkg.engenty && typeof pkg.engenty === "object" && !Array.isArray(pkg.engenty)
      ? (pkg.engenty as Record<string, unknown>)
      : {};

  const nextPlugins: Record<string, Record<string, unknown>> = {};
  for (const [rawSlug, value] of Object.entries(plugins)) {
    const slug = parsePluginSlug(rawSlug);
    nextPlugins[slug] = serializePluginEntry(parsePluginEntry(slug, value));
  }

  const next = {
    ...pkg,
    engenty: {
      ...engenty,
      plugins: nextPlugins,
    },
  };
  delete (next.engenty as Record<string, unknown>).modules;

  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8"
  );
}

export function enablePluginsInManifest(
  repoRoot: string,
  slugs: string[]
): void {
  const current = readEngentyPluginsManifest(repoRoot);
  const next: Record<string, Record<string, unknown>> = {};
  for (const slug of current.slugs) {
    next[slug] = serializePluginEntry(current.plugins[slug]!);
  }
  for (const rawSlug of slugs) {
    const slug = parsePluginSlug(rawSlug);
    next[slug] = { source: "workspace" };
  }
  writeEngentyPluginsObject(
    repoRoot,
    Object.fromEntries(
      Object.keys(next)
        .sort()
        .map((slug) => [slug, next[slug]!])
    )
  );
}

export function disablePluginsInManifest(
  repoRoot: string,
  slugs: string[]
): void {
  const current = readEngentyPluginsManifest(repoRoot);
  const remove = new Set(slugs.map((slug) => parsePluginSlug(slug)));
  const next: Record<string, Record<string, unknown>> = {};
  for (const slug of current.slugs) {
    if (remove.has(slug)) {
      continue;
    }
    next[slug] = serializePluginEntry(current.plugins[slug]!);
  }
  writeEngentyPluginsObject(repoRoot, next);
}
