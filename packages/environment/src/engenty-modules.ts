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

function parsePluginEntry(slug: string, value: unknown): EngentyPluginSpec {
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
    pkg.engenty &&
    typeof pkg.engenty === "object" &&
    !Array.isArray(pkg.engenty)
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
      'engenty.plugins must be an object map — use { "my-plugin": { "source": "workspace" } }'
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

/**
 * A workspace module lives at `modules/<slug>` (slug = dirname) or, for
 * connector-style providers, at `modules/<parent>/providers/<child>` where the
 * slug is taken from the nested `engenty.plugin.json` `id`. Only the literal
 * `providers` segment is scanned one level deeper — never `src`, `ui`, `dist`,
 * or `node_modules`.
 *
 * Fails loud (throws) on a nested manifest with a missing/invalid id, a slug
 * that collides with another module, or a `package.json` name that disagrees
 * with the manifest id — these would otherwise become silent "module missing"
 * drops downstream.
 */
export function listWorkspaceModulesOnDisk(
  repoRoot: string
): Array<{ dir: string; slug: string }> {
  const modulesDir = path.join(repoRoot, "modules");
  if (!fs.existsSync(modulesDir)) {
    return [];
  }
  const results: Array<{ dir: string; slug: string }> = [];
  const seen = new Map<string, string>();
  const add = (slug: string, dir: string): void => {
    const prior = seen.get(slug);
    if (prior) {
      throw new Error(
        `Duplicate module slug "${slug}" on disk: ${prior} and ${dir}`
      );
    }
    seen.set(slug, dir);
    results.push({ slug, dir });
  };

  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const topDir = path.join(modulesDir, entry.name);
    if (fs.existsSync(path.join(topDir, ENGENTY_PLUGIN_MANIFEST))) {
      add(entry.name, topDir);
    }
    const providersDir = path.join(topDir, "providers");
    if (
      !(fs.existsSync(providersDir) && fs.statSync(providersDir).isDirectory())
    ) {
      continue;
    }
    for (const child of fs.readdirSync(providersDir, { withFileTypes: true })) {
      if (!child.isDirectory()) {
        continue;
      }
      const childDir = path.join(providersDir, child.name);
      if (!fs.existsSync(path.join(childDir, ENGENTY_PLUGIN_MANIFEST))) {
        continue;
      }
      const manifest = readPluginManifest(childDir);
      const id =
        manifest && typeof manifest.id === "string" ? manifest.id.trim() : "";
      if (!(id && SLUG_REGEX.test(id))) {
        throw new Error(
          `Nested module ${childDir} must declare a valid kebab-case "id" in ${ENGENTY_PLUGIN_MANIFEST}`
        );
      }
      const pkgPath = path.join(childDir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkgName = (
          JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: string }
        ).name;
        if (pkgName && pkgName !== modulePackageName(id)) {
          throw new Error(
            `Nested module ${childDir} package name "${pkgName}" must equal "${modulePackageName(
              id
            )}" (from manifest id "${id}")`
          );
        }
      }
      add(id, childDir);
    }
  }

  return results.sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
  );
}

export function resolveModuleDir(repoRoot: string, slug: string): string {
  const direct = path.join(repoRoot, "modules", slug);
  if (fs.existsSync(path.join(direct, ENGENTY_PLUGIN_MANIFEST))) {
    return direct;
  }
  const nested = listWorkspaceModulesOnDisk(repoRoot).find(
    (mod) => mod.slug === slug
  );
  return nested?.dir ?? direct;
}

export function listWorkspaceModuleSlugsOnDisk(repoRoot: string): string[] {
  return listWorkspaceModulesOnDisk(repoRoot)
    .map((mod) => mod.slug)
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
  const onDisk = new Map(
    listWorkspaceModulesOnDisk(repoRoot).map((mod) => [mod.slug, mod.dir])
  );
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
    const dir = onDisk.get(slug) ?? path.join(repoRoot, "modules", slug);
    if (!fs.existsSync(dir)) {
      // Soft-skip: open worktrees / partial checkouts often list closed plugins
      // in package.json that are not on disk. CI still fails via
      // check-engenty-plugins when the set must be complete.
      console.warn(
        `engenty.plugins: skipping "${slug}" (not on disk — modules/${slug} or modules/*/providers/${slug})`
      );
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

/**
 * Enabled workspace modules resolved to their on-disk directory (top-level or
 * nested `providers/*`), for plugin discovery that needs the real slug of a
 * nested provider rather than its dirname.
 */
export function listEnabledModulesOnDiskFromDir(
  startDir: string
): Array<{ dir: string; slug: string }> {
  const repoRoot = findEngentyRepoRootFrom(startDir);
  const enabled = enabledModuleSlugSet(repoRoot);
  return listWorkspaceModulesOnDisk(repoRoot).filter((mod) =>
    enabled.has(mod.slug)
  );
}

export function isEnabledModuleSlug(repoRoot: string, slug: string): boolean {
  return enabledModuleSlugSet(repoRoot).has(slug);
}

function serializePluginEntry(
  spec: EngentyPluginSpec
): Record<string, unknown> {
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
    pkg.engenty &&
    typeof pkg.engenty === "object" &&
    !Array.isArray(pkg.engenty)
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
  (next.engenty as Record<string, unknown>).modules = undefined;

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
