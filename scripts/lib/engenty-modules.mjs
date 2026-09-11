#!/usr/bin/env node
import fs from "node:fs";
/**
 * Root package.json `engenty.plugins` — declared workspace plugin map (SSOT).
 */
import { createRequire } from "node:module";
import path from "node:path";

export const ENGENTY_PLUGIN_MANIFEST = "engenty.plugin.json";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function modulePackageName(slug) {
  return `@engenty/${slug}`;
}

export function resolveRepoRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 20; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
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

export function readRootPackageJson(repoRoot) {
  const pkgPath = path.join(repoRoot, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`Missing ${pkgPath}`);
  }
  return JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
}

function parsePluginSlug(slug) {
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

function parsePluginEntry(slug, value) {
  if (value === "workspace") {
    return { slug, source: "workspace", config: {} };
  }
  if (
    value === undefined ||
    value === null ||
    (typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0)
  ) {
    return { slug, source: "workspace", config: {} };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const source =
      typeof value.source === "string" && value.source.trim().length > 0
        ? value.source.trim()
        : "workspace";
    const { source: _source, ...config } = value;
    return { slug, source, config };
  }
  throw new Error(
    `engenty.plugins.${slug} must be "workspace", {}, or { "source": "..." }`
  );
}

export function readEngentyPluginsManifest(repoRoot) {
  const pkg = readRootPackageJson(repoRoot);
  const engenty =
    pkg.engenty &&
    typeof pkg.engenty === "object" &&
    !Array.isArray(pkg.engenty)
      ? pkg.engenty
      : {};

  let rawPlugins = null;
  if (
    engenty.plugins &&
    typeof engenty.plugins === "object" &&
    !Array.isArray(engenty.plugins)
  ) {
    rawPlugins = engenty.plugins;
  } else if (Array.isArray(engenty.plugins)) {
    throw new Error(
      'engenty.plugins must be an object map — use { "my-plugin": { "source": "workspace" } }'
    );
  } else if (Array.isArray(engenty.modules)) {
    // The pre-plugins manifest shape. Accepted silently until 2026-08-04; no
    // manifest in the repo used it, so it fails loudly now rather than quietly
    // reading a format nothing writes. Mirrors packages/environment.
    throw new Error(
      'engenty.modules (array) is no longer supported — use engenty.plugins: { "my-plugin": { "source": "workspace" } }'
    );
  } else {
    rawPlugins = {};
  }

  const plugins = {};
  const slugs = [];
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
export function readEngentyModulesManifest(repoRoot) {
  return readEngentyPluginsManifest(repoRoot);
}

/**
 * A workspace module lives at `modules/<slug>` (slug = dirname) or, for
 * connector-style providers, at `modules/<parent>/providers/<child>` where the
 * slug is taken from the nested `engenty.plugin.json` `id`. Only the literal
 * `providers` segment is scanned one level deeper. Throws (fails loud) on a
 * nested manifest with a missing/invalid id, a slug collision, or a
 * `package.json` name that disagrees with the manifest id.
 */
export function listWorkspaceModulesOnDisk(repoRoot) {
  const modulesDir = path.join(repoRoot, "modules");
  if (!fs.existsSync(modulesDir)) {
    return [];
  }
  const results = [];
  const seen = new Map();
  const add = (slug, dir) => {
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
        const pkgName = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name;
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

export function resolveModuleDir(repoRoot, slug) {
  const direct = path.join(repoRoot, "modules", slug);
  if (fs.existsSync(path.join(direct, ENGENTY_PLUGIN_MANIFEST))) {
    return direct;
  }
  const nested = listWorkspaceModulesOnDisk(repoRoot).find(
    (mod) => mod.slug === slug
  );
  return nested ? nested.dir : direct;
}

export function listWorkspaceModuleSlugsOnDisk(repoRoot) {
  return listWorkspaceModulesOnDisk(repoRoot)
    .map((mod) => mod.slug)
    .sort();
}

export function readPluginManifest(moduleDir) {
  const manifestPath = path.join(moduleDir, ENGENTY_PLUGIN_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
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
 * Keep in sync with the UI artifact generator's `resolveConventionUiImportPath`
 * (apps/ui/scripts/plugin-artifact-generator-lib.mjs), which is the authority
 * on what the built catalog contains.
 */
/** The module's declared package name, when it is on disk. */
function readModulePackageName(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    const name = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

export function moduleHasUi(manifest, moduleDir) {
  if (manifest && typeof manifest === "object") {
    const ui = manifest.ui;
    if (ui === true) {
      return true;
    }
    if (
      ui &&
      typeof ui === "object" &&
      !Array.isArray(ui) &&
      typeof ui.entry === "string" &&
      ui.entry.trim().length > 0
    ) {
      return true;
    }
    const capabilities = manifest.capabilities;
    if (
      capabilities &&
      typeof capabilities === "object" &&
      !Array.isArray(capabilities) &&
      capabilities.ui === true
    ) {
      return true;
    }
  }

  if (typeof moduleDir !== "string" || moduleDir.length === 0) {
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
export function registryModulePackageName(slug, spec) {
  const override =
    spec && typeof spec.config?.package === "string"
      ? spec.config.package.trim()
      : "";
  return override || modulePackageName(slug);
}

/**
 * Resolve the on-disk root of a module installed from the registry into
 * node_modules. Uses Node resolution rooted at the repo so pnpm's hoisted
 * symlink store is followed. Returns undefined if the package is not installed.
 */
export function resolveRegistryModuleDir(repoRoot, packageName) {
  // Filesystem-first: pnpm links a direct dependency to
  // node_modules/<packageName> (a symlink into the store). This is preferred
  // over require.resolve because a module's `exports` map does not expose the
  // manifest subpath, so require.resolve(`<pkg>/engenty.plugin.json`) throws.
  const linked = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  if (fs.existsSync(path.join(linked, ENGENTY_PLUGIN_MANIFEST))) {
    return linked;
  }
  // Fallback: resolve the package's own package.json (allowed even with a
  // restrictive exports map on most resolvers) and take its directory.
  try {
    const require = createRequire(path.join(repoRoot, "package.json"));
    const pkgJson = require.resolve(`${packageName}/package.json`);
    const dir = path.dirname(pkgJson);
    return fs.existsSync(path.join(dir, ENGENTY_PLUGIN_MANIFEST))
      ? dir
      : undefined;
  } catch {
    return;
  }
}

export function resolveEnabledModules(repoRoot, options = {}) {
  const { plugins, slugs } = readEngentyPluginsManifest(repoRoot);
  const strict = options.strict !== false;
  const onDisk = new Map(
    listWorkspaceModulesOnDisk(repoRoot).map((mod) => [mod.slug, mod.dir])
  );
  const modules = [];

  for (const slug of slugs) {
    const spec = plugins[slug];
    if (!spec) {
      continue;
    }
    let dir;
    let packageName;
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
        // check-engenty-plugins.mjs when the set must be complete.
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

export function enabledModuleSlugSet(repoRoot) {
  return new Set(readEngentyPluginsManifest(repoRoot).slugs);
}

export function isEnabledModuleSlug(repoRoot, slug) {
  return enabledModuleSlugSet(repoRoot).has(slug);
}

export function filterModuleDirectoryNames(repoRoot, directoryNames) {
  const enabled = enabledModuleSlugSet(repoRoot);
  return directoryNames.filter((name) => enabled.has(name));
}

function serializePluginEntry(spec) {
  if (spec.source === "workspace" && Object.keys(spec.config).length === 0) {
    return { source: "workspace" };
  }
  return { source: spec.source, ...spec.config };
}

export function writeEngentyPluginsObject(repoRoot, plugins) {
  const pkg = readRootPackageJson(repoRoot);
  const engenty =
    pkg.engenty &&
    typeof pkg.engenty === "object" &&
    !Array.isArray(pkg.engenty)
      ? pkg.engenty
      : {};

  const nextPlugins = {};
  for (const [rawSlug, value] of Object.entries(plugins)) {
    const slug = parsePluginSlug(rawSlug);
    nextPlugins[slug] =
      typeof value === "string"
        ? serializePluginEntry(parsePluginEntry(slug, value))
        : serializePluginEntry(parsePluginEntry(slug, value));
  }

  const next = {
    ...pkg,
    engenty: {
      ...engenty,
      plugins: nextPlugins,
    },
  };
  next.engenty.modules = undefined;

  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    `${JSON.stringify(next, null, 2)}\n`,
    "utf-8"
  );
}

export function enablePluginsInManifest(repoRoot, slugs) {
  const current = readEngentyPluginsManifest(repoRoot);
  const next = {};
  for (const slug of current.slugs) {
    next[slug] = serializePluginEntry(current.plugins[slug]);
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
        .map((slug) => [slug, next[slug]])
    )
  );
}

export function disablePluginsInManifest(repoRoot, slugs) {
  const current = readEngentyPluginsManifest(repoRoot);
  const remove = new Set(slugs.map((slug) => parsePluginSlug(slug)));
  const next = {};
  for (const slug of current.slugs) {
    if (remove.has(slug)) {
      continue;
    }
    next[slug] = serializePluginEntry(current.plugins[slug]);
  }
  writeEngentyPluginsObject(repoRoot, next);
}
