#!/usr/bin/env node
/**
 * Root package.json `engenty.plugins` — declared workspace plugin map (SSOT).
 */
import fs from "node:fs";
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

function readLegacyModulesArray(engenty) {
  if (!Array.isArray(engenty.modules)) {
    return null;
  }
  const plugins = {};
  for (const entry of engenty.modules) {
    if (typeof entry !== "string") {
      throw new Error("Legacy engenty.modules entries must be slug strings");
    }
    const slug = parsePluginSlug(entry);
    plugins[slug] = parsePluginEntry(slug, {});
  }
  return plugins;
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
  } else {
    rawPlugins = readLegacyModulesArray(engenty) ?? {};
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

export function resolveModuleDir(repoRoot, slug) {
  return path.join(repoRoot, "modules", slug);
}

export function listWorkspaceModuleSlugsOnDisk(repoRoot) {
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

export function moduleHasUi(manifest) {
  if (!manifest || typeof manifest !== "object") {
    return false;
  }
  const ui = manifest.ui;
  if (ui === true) {
    return true;
  }
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
    return false;
  }
  return typeof ui.entry === "string" && ui.entry.trim().length > 0;
}

export function resolveEnabledModules(repoRoot, options = {}) {
  const { plugins, slugs } = readEngentyPluginsManifest(repoRoot);
  const strict = options.strict !== false;
  const modules = [];

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
