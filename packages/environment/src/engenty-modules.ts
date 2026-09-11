import fs from "node:fs";
import path from "node:path";

export const ENGENTY_PLUGIN_MANIFEST = "engenty.plugin.json";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface EngentyPluginSpec {
  config: Record<string, unknown>;
  slug: string;
  source: string;
}

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
  } else if (Array.isArray(engenty.modules)) {
    // The pre-plugins manifest shape. Accepted silently until 2026-08-04; no
    // manifest in the repo used it, so it fails loudly now rather than quietly
    // reading a format nothing writes.
    throw new Error(
      'engenty.modules (array) is no longer supported — use engenty.plugins: { "my-plugin": { "source": "workspace" } }'
    );
  } else {
    rawPlugins = {};
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

export function readEngentyPluginsManifestFromCwd(
  startDir = process.cwd()
): EngentyPluginsManifest {
  const repoRoot = findEngentyRepoRootFrom(startDir);
  return readEngentyPluginsManifest(repoRoot);
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

/** Convention entry points — a module with one of these ships a UI. */
const UI_PLUGIN_CONVENTION_FILES = ["plugin.ts", "plugin.mts", "plugin.js"];

/**
 * Whether a module contributes a UI plugin.
 *
 * Three signals, because the manifest is the exception rather than the rule:
 * a declared `ui.entry`, a declared `capabilities.ui`, and — how almost every
 * module actually does it — the convention file `ui/plugin.ts`. Only the last
 * needs the directory, which is why `moduleDir` is worth passing whenever the
 * caller has it. Checking the manifest alone answers `false` for nearly every
 * real module, and `syncUiModuleDependencies` then deletes their dependencies
 * from `apps/ui/package.json`.
 *
 * Keep in sync with scripts/lib/engenty-modules.mjs and with the UI artifact
 * generator's `resolveConventionUiImportPath`, which is the authority on what
 * the built catalog contains.
 */
/** The module's declared package name, when it is on disk. */
function readModulePackageName(dir: string): string | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    const name = (
      JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { name?: unknown }
    ).name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

export function moduleHasUi(
  manifest: Record<string, unknown> | null,
  moduleDir?: string
): boolean {
  if (manifest) {
    const ui = manifest.ui;
    if (ui === true) {
      return true;
    }
    if (ui && typeof ui === "object" && !Array.isArray(ui)) {
      const entry = (ui as { entry?: unknown }).entry;
      if (typeof entry === "string" && entry.trim().length > 0) {
        return true;
      }
    }
    const capabilities = manifest.capabilities;
    if (
      capabilities &&
      typeof capabilities === "object" &&
      !Array.isArray(capabilities) &&
      (capabilities as { ui?: unknown }).ui === true
    ) {
      return true;
    }
  }

  if (!moduleDir) {
    return false;
  }
  return UI_PLUGIN_CONVENTION_FILES.some((file) =>
    fs.existsSync(path.join(moduleDir, "ui", file))
  );
}

/**
 * Package name a registry-installed module resolves to. Defaults to
 * `@engenty/<slug>`, overridable via `engenty.plugins.<slug>.package` for the
 * modules whose package name diverges from the slug (e.g. pdf-templates →
 * @engenty/pdf-templates-module).
 */
export function registryModulePackageName(
  slug: string,
  spec: EngentyPluginSpec
): string {
  const override =
    typeof spec.config?.package === "string" ? spec.config.package.trim() : "";
  return override || modulePackageName(slug);
}

/**
 * Resolve the on-disk root of a module installed from the registry into
 * node_modules. pnpm links a direct dependency to node_modules/<packageName>,
 * so a filesystem check is enough. Returns undefined if not installed.
 *
 * NOTE: this file is bundled into the browser SPA, so it must stay free of
 * node:module/createRequire (a named import from an externalized builtin throws
 * at load → white screen). The build-side twin (scripts/lib/engenty-modules.mjs)
 * keeps a require.resolve fallback; here the fs check is sufficient.
 */
export function resolveRegistryModuleDir(
  repoRoot: string,
  packageName: string
): string | undefined {
  const linked = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  return fs.existsSync(path.join(linked, ENGENTY_PLUGIN_MANIFEST))
    ? linked
    : undefined;
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
    let dir: string | undefined;
    let packageName: string;
    if (spec.source === "workspace") {
      dir = onDisk.get(slug) ?? path.join(repoRoot, "modules", slug);
      // The module's own package.json is the authority: a handful diverge from
      // the `@engenty/<slug>` convention (files → @engenty/files-ui,
      // pdf-templates → @engenty/pdf-templates-module), and a derived name
      // that does not exist breaks `pnpm install` for anyone who writes it
      // into a manifest.
      packageName = readModulePackageName(dir) ?? modulePackageName(slug);
      if (!fs.existsSync(dir)) {
        // Soft-skip: open worktrees / partial checkouts often list closed
        // plugins in package.json that are not on disk. CI still fails via
        // check-engenty-plugins when the set must be complete.
        console.warn(
          `engenty.plugins: skipping "${slug}" (not on disk — modules/${slug} or modules/*/providers/${slug})`
        );
        continue;
      }
    } else if (spec.source === "registry") {
      packageName = registryModulePackageName(slug, spec);
      dir = resolveRegistryModuleDir(repoRoot, packageName);
      if (!dir) {
        if (strict) {
          throw new Error(
            `engenty.plugins.${slug} uses source "registry" but ${packageName} is not installed (run pnpm install)`
          );
        }
        console.warn(
          `engenty.plugins: skipping "${slug}" (registry package ${packageName} not installed)`
        );
        continue;
      }
    } else {
      if (strict) {
        throw new Error(
          `engenty.plugins.${slug} uses unknown source "${spec.source}" — expected "workspace" or "registry"`
        );
      }
      continue;
    }
    const manifest = readPluginManifest(dir);
    if (!manifest) {
      if (strict) {
        throw new Error(`${dir} is missing ${ENGENTY_PLUGIN_MANIFEST}`);
      }
      continue;
    }
    modules.push({
      slug,
      dir,
      packageName,
      manifest,
      hasUi: moduleHasUi(manifest, dir),
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
