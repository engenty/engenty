import fs from "node:fs";
import path from "node:path";

const pluginOrderPriority = new Map([
  ["auth-ui", 0],
  ["user-management-ui", 1],
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

/**
 * When `engenty.plugin.json` omits `id`, core discovery derives it from the
 * package folder name under `modules/*` or `packages/*`. Mirror that here so
 * UI catalog generation stays aligned without duplicating `id` in minimal manifests.
 */
export function resolveConventionPluginIdFromPkgDir(pkgDir) {
  const abs = path.resolve(pkgDir);
  const parent = path.basename(path.dirname(abs));
  if (parent !== "modules" && parent !== "packages") {
    return "";
  }
  const base = path.basename(abs);
  return typeof base === "string" && base.trim() ? base.trim() : "";
}

function readPackageJson(pkgDir) {
  const packagePath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isConventionalWorkspaceRoot(pkgDir) {
  const abs = path.resolve(pkgDir);
  const parent = path.basename(path.dirname(abs));
  if (parent === "modules" || parent === "packages") {
    return true;
  }
  // Nested connector providers: modules/<parent>/providers/<child>
  if (parent === "providers") {
    return (
      path.basename(path.dirname(path.dirname(path.dirname(abs)))) === "modules"
    );
  }
  return false;
}

/** Mirrors `resolveDefaultTailwindSources` in apps/core/src/plugins/manifest.ts */
function resolveDefaultTailwindSources(pkgDir) {
  if (!isConventionalWorkspaceRoot(pkgDir)) {
    return;
  }
  const uiDir = path.join(pkgDir, "ui");
  if (fs.existsSync(uiDir) && fs.statSync(uiDir).isDirectory()) {
    return ["./ui"];
  }
  const parent = path.basename(path.dirname(path.resolve(pkgDir)));
  if (parent === "packages") {
    const srcDir = path.join(pkgDir, "src");
    if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
      return ["./src"];
    }
  }
  return;
}

function resolveConventionUiImportPath({ packageManifest, pkgDir }) {
  if (!isConventionalWorkspaceRoot(pkgDir)) {
    return "";
  }
  const candidates = [
    path.join(pkgDir, "ui", "plugin.ts"),
    path.join(pkgDir, "ui", "plugin.mts"),
    path.join(pkgDir, "ui", "plugin.js"),
  ];
  if (!candidates.some((candidate) => fs.existsSync(candidate))) {
    return "";
  }
  const packageName =
    typeof packageManifest?.name === "string" && packageManifest.name.trim()
      ? packageManifest.name.trim()
      : "";
  return packageName ? `${packageName}/ui/plugin` : "./ui/plugin.ts";
}

export function enrichManifestForUiArtifacts({
  manifest,
  packageManifest,
  pkgDir,
}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return manifest;
  }
  const packageJson = packageManifest ?? readPackageJson(pkgDir);
  const existing =
    typeof manifest.id === "string" && manifest.id.trim()
      ? manifest.id.trim()
      : "";
  const derived = resolveConventionPluginIdFromPkgDir(pkgDir);
  const id = existing || derived;
  const ui =
    manifest.ui &&
    typeof manifest.ui === "object" &&
    !Array.isArray(manifest.ui)
      ? manifest.ui
      : undefined;
  const conventionUiEntry = resolveConventionUiImportPath({
    packageManifest: packageJson,
    pkgDir,
  });
  const uiEntry =
    typeof ui?.entry === "string" && ui.entry.trim()
      ? ui.entry.trim()
      : conventionUiEntry;
  const explicitTailwind = cleanStringArray(ui?.tailwindSources);
  const resolvedTailwindSources =
    explicitTailwind.length > 0
      ? explicitTailwind
      : (resolveDefaultTailwindSources(pkgDir) ?? []);
  const enrichedUi = uiEntry
    ? {
        entry: uiEntry,
        export:
          typeof ui?.export === "string" && ui.export.trim()
            ? ui.export.trim()
            : "default",
        load:
          ui?.load === "runtime" || ui?.load === "workspace"
            ? ui.load
            : conventionUiEntry
              ? "workspace"
              : "runtime",
        ...(resolvedTailwindSources.length > 0
          ? { tailwindSources: resolvedTailwindSources }
          : {}),
      }
    : undefined;
  const capabilities =
    enrichedUi && manifest.capabilities?.ui === undefined
      ? { ...(manifest.capabilities ?? {}), ui: true }
      : manifest.capabilities;
  return {
    ...manifest,
    ...(id ? { id } : {}),
    ...(enrichedUi ? { ui: enrichedUi } : {}),
    ...(capabilities ? { capabilities } : {}),
  };
}

export function normalizeAndSortUiPlugins(entries) {
  const sortedEntries = [...entries].sort((left, right) => {
    const leftPriority = pluginOrderPriority.get(left.id) ?? 1000;
    const rightPriority = pluginOrderPriority.get(right.id) ?? 1000;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return left.id.localeCompare(right.id);
  });

  const byId = new Map(sortedEntries.map((entry) => [entry.id, entry]));
  const visiting = new Set();
  const visited = new Set();
  const result = [];

  const visit = (entry) => {
    if (visited.has(entry.id)) {
      return;
    }
    if (visiting.has(entry.id)) {
      return;
    }

    visiting.add(entry.id);
    for (const pluginId of entry.optionalPluginIds ?? []) {
      const dependency = byId.get(pluginId);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.delete(entry.id);
    visited.add(entry.id);
    result.push(entry);
  };

  for (const entry of sortedEntries) {
    visit(entry);
  }

  return result;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

export function getPackageNameFromUiImportPath(importPath) {
  if (typeof importPath !== "string") {
    return null;
  }
  const trimmed = importPath.trim();
  if (
    !trimmed ||
    trimmed.startsWith(".") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return null;
  }
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  if (parts[0]?.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] ?? null;
}

export function createMissingUiWorkspaceDependencyMessage(packageName) {
  return `Missing generated UI workspace dependency: Add "${packageName}": "workspace:*" to apps/ui/package.json, then run pnpm install and pnpm --filter @engenty/ui generate:plugins.`;
}

export function collectMissingUiWorkspaceDependencies({
  entries,
  uiPackageManifest,
  workspacePackageNames,
}) {
  const dependencies =
    uiPackageManifest?.dependencies &&
    typeof uiPackageManifest.dependencies === "object"
      ? uiPackageManifest.dependencies
      : {};
  const workspacePackages = new Set(workspacePackageNames ?? []);
  const missing = new Set();

  for (const entry of entries) {
    const packageName = getPackageNameFromUiImportPath(entry?.importPath);
    if (
      packageName &&
      entry?.load === "workspace" &&
      workspacePackages.has(packageName) &&
      !Object.hasOwn(dependencies, packageName)
    ) {
      missing.add(packageName);
    }
  }

  return [...missing].sort((left, right) => left.localeCompare(right));
}

export function assertUiWorkspaceDependencies(options) {
  const missing = collectMissingUiWorkspaceDependencies(options);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    missing.map(createMissingUiWorkspaceDependencyMessage).join("\n")
  );
}

export function collectChangedGeneratedArtifacts(artifacts) {
  return artifacts
    .filter((artifact) => artifact.actualContent !== artifact.expectedContent)
    .map((artifact) => artifact.filePath);
}

function normalizeOptionalPluginId(value) {
  return value.startsWith("module.") ? value.slice("module.".length) : value;
}

export function createUiCatalogSourceInfo({
  entry,
  manifestPath,
  packageManifest,
  pkgDir,
  repoRootDir,
  sourceType,
}) {
  return {
    pluginId: entry.id,
    packageName:
      typeof packageManifest?.name === "string"
        ? packageManifest.name
        : undefined,
    version:
      typeof packageManifest?.version === "string"
        ? packageManifest.version
        : undefined,
    sourceType,
    rootDir: toPosix(path.relative(repoRootDir, pkgDir)) || ".",
    source: entry.importPath,
    manifestPath: toPosix(path.relative(repoRootDir, manifestPath)),
    manifestId: entry.id,
    registrationKind: "ui.plugin",
  };
}

export function normalizeManifestUiEntry({ manifest, manifestPath, pkgDir }) {
  const enrichedManifest = enrichManifestForUiArtifacts({
    manifest,
    pkgDir,
  });
  if (!enrichedManifest || typeof enrichedManifest !== "object") {
    return null;
  }
  const ui = enrichedManifest.ui;
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
    return null;
  }
  const id =
    typeof enrichedManifest.id === "string" ? enrichedManifest.id.trim() : "";
  const entry = typeof ui.entry === "string" ? ui.entry.trim() : "";
  const exportName =
    typeof ui.export === "string" && ui.export.trim()
      ? ui.export.trim()
      : "default";
  const load = ui.load === "workspace" ? "workspace" : "runtime";
  if (!(id && entry)) {
    throw new Error(
      `Invalid ui metadata in ${manifestPath}: id and ui.entry are required`
    );
  }
  return {
    id,
    importPath: entry,
    load,
    exportName,
    optionalPluginIds: cleanStringArray(enrichedManifest.optional).map(
      normalizeOptionalPluginId
    ),
    tailwindSources: cleanStringArray(ui.tailwindSources).map((source) =>
      path.resolve(pkgDir, source)
    ),
  };
}

export function renderCatalog(entries) {
  const lines = [
    "/* AUTO-GENERATED FILE. DO NOT EDIT. */",
    'import type { UiPluginCatalogEntry } from "./catalog";',
    'import { createGeneratedUiPluginCatalogEntry } from "./runtime-ui-loader";',
    "",
    "export const uiPluginCatalog: UiPluginCatalogEntry[] = [",
    ...entries.map((entry) => {
      const sourceInfo = entry.sourceInfo
        ? `, sourceInfo: ${JSON.stringify(entry.sourceInfo)}`
        : "";
      return `  createGeneratedUiPluginCatalogEntry({ pluginId: "${entry.id}", importPath: "${entry.importPath}", exportName: "${entry.exportName}", loadModule: async () => await import("${entry.importPath}"), loadStatic: async () => (await import("${entry.importPath}")).${entry.exportName}, optionalPluginIds: [${(entry.optionalPluginIds ?? []).map((pluginId) => `"${pluginId}"`).join(", ")}]${sourceInfo} }),`;
    }),
    "];",
    "",
  ];
  return `${lines.join("\n")}`;
}

export function renderTailwindSources({
  entries,
  staticTailwindSources,
  uiSrcDir,
}) {
  const toUiSourceRelative = (absPath) => {
    const rel = path.relative(uiSrcDir, absPath);
    return toPosix(rel.startsWith(".") ? rel : `./${rel}`);
  };

  const allSources = new Set(staticTailwindSources.map(toUiSourceRelative));
  for (const entry of entries) {
    for (const sourcePath of entry.tailwindSources) {
      allSources.add(toUiSourceRelative(sourcePath));
    }
  }

  const sortedSources = [...allSources].sort((left, right) =>
    left.localeCompare(right)
  );
  const lines = [
    "/* AUTO-GENERATED FILE. DO NOT EDIT. */",
    ...sortedSources.map((source) => `@source "${source}";`),
    "",
  ];
  return lines.join("\n");
}
