#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectChangedGeneratedArtifacts,
  createUiCatalogSourceInfo,
  enrichManifestForUiArtifacts,
  normalizeAndSortUiPlugins,
  normalizeManifestUiEntry,
  renderCatalog,
  renderTailwindSources,
} from "./plugin-artifact-generator-lib.mjs";
import { enabledModuleSlugSet } from "../../../scripts/lib/engenty-modules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiRootDir = path.resolve(__dirname, "..");
const repoRootDir = path.resolve(uiRootDir, "..", "..");
const uiSrcDir = path.join(uiRootDir, "src");

const modulesDir = path.join(repoRootDir, "modules");
const packagesDir = path.join(repoRootDir, "packages");
const targetManifestFileName = "engenty.plugin.json";

const generatedCatalogPath = path.join(
  uiSrcDir,
  "plugins",
  "generated-catalog.ts"
);
const generatedTailwindSourcesPath = path.join(
  uiSrcDir,
  "plugins",
  "generated-tailwind-sources.css"
);

const staticTailwindSources = [
  path.join(repoRootDir, "packages", "ui-core", "src"),
  path.join(repoRootDir, "packages", "ui-core", "dist"),
  path.join(repoRootDir, "packages", "app-shell", "src"),
  path.join(repoRootDir, "packages", "app-shell", "dist"),
  path.join(repoRootDir, "packages", "commercial-editor", "src"),
  path.join(repoRootDir, "packages", "commercial-editor", "dist"),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function listPackageDirs(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));
}

function listWorkspacePackageDirs() {
  const enabled = enabledModuleSlugSet(repoRootDir);
  const moduleDirs = listPackageDirs(modulesDir).filter((dir) =>
    enabled.has(path.basename(dir))
  );
  return [...moduleDirs, ...listPackageDirs(packagesDir)];
}

function discoverUiPlugins(packageDirs) {
  const entries = [];

  for (const pkgDir of packageDirs) {
    const moduleManifestPath = path.join(pkgDir, targetManifestFileName);
    if (fs.existsSync(moduleManifestPath)) {
      const moduleManifestRaw = readJson(moduleManifestPath);
      const packageManifestPath = path.join(pkgDir, "package.json");
      const packageManifest = fs.existsSync(packageManifestPath)
        ? readJson(packageManifestPath)
        : null;
      const moduleManifest = enrichManifestForUiArtifacts({
        manifest: moduleManifestRaw,
        packageManifest,
        pkgDir,
      });
      const manifestEntry = normalizeManifestUiEntry({
        manifest: moduleManifest,
        manifestPath: moduleManifestPath,
        pkgDir,
      });
      if (manifestEntry && manifestEntry.load !== "runtime") {
        entries.push({
          ...manifestEntry,
          sourceInfo: createUiCatalogSourceInfo({
            entry: manifestEntry,
            manifestPath: moduleManifestPath,
            packageManifest,
            pkgDir,
            repoRootDir,
            sourceType: pkgDir.startsWith(`${modulesDir}${path.sep}`)
              ? "module"
              : "package",
          }),
        });
      }
    }
  }

  return normalizeAndSortUiPlugins(entries);
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function renderGeneratedArtifacts(entries) {
  return [
    {
      filePath: generatedCatalogPath,
      content: renderCatalog(entries),
    },
    {
      filePath: generatedTailwindSourcesPath,
      content: renderTailwindSources({
        entries,
        staticTailwindSources,
        uiSrcDir,
      }),
    },
  ];
}

function checkGeneratedArtifacts(artifacts) {
  const changedArtifacts = collectChangedGeneratedArtifacts(
    artifacts.map((artifact) => ({
      filePath: artifact.filePath,
      expectedContent: artifact.content,
      actualContent: readTextIfExists(artifact.filePath),
    }))
  );

  if (changedArtifacts.length === 0) {
    return;
  }

  const changedPaths = changedArtifacts
    .map((filePath) => `- ${path.relative(repoRootDir, filePath)}`)
    .join("\n");
  throw new Error(
    `Generated plugin artifacts are out of date:\n${changedPaths}\nRun pnpm engenty setup (or pnpm --filter @engenty/ui generate:plugins).`
  );
}

function main() {
  const args = new Set(process.argv.slice(2));
  for (const arg of args) {
    if (arg !== "--check") {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  const packageDirs = listWorkspacePackageDirs();
  const entries = discoverUiPlugins(packageDirs);

  const artifacts = renderGeneratedArtifacts(entries);
  if (args.has("--check")) {
    checkGeneratedArtifacts(artifacts);
    console.log("Generated plugin artifacts are up to date.");
    return;
  }

  for (const artifact of artifacts) {
    writeFile(artifact.filePath, artifact.content);
    console.log(`Generated ${path.relative(repoRootDir, artifact.filePath)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error && error.message ? error.message : String(error)
  );
  process.exitCode = 1;
}
