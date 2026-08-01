#!/usr/bin/env node
/**
 * write-about-data.mjs — slim changelog + OSS credits for the About dialogs.
 *
 *   pnpm about:data                 # rewrite both files
 *   pnpm about:data --changelog     # slim changelog only (used by release.mjs)
 *   pnpm about:data --credits       # OSS credits only
 *
 * Reads root changelog.json (git-cliff --context) and `pnpm licenses list --json`.
 * OSS credits = direct deps declared in workspace package.json files only
 * (not the full transitive tree), grouped as:
 *   - shared: declared by 2+ workspaces
 *   - groups: unique deps per app / package / module
 * Writes apps/ui/src/data/{changelog,oss-credits}.json.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
const CHANGELOG_JSON = path.join(ROOT, "changelog.json");
const OUT_DIR = path.join(ROOT, "apps", "ui", "src", "data");
const OUT_CHANGELOG = path.join(OUT_DIR, "changelog.json");
const OUT_CREDITS = path.join(OUT_DIR, "oss-credits.json");

const args = new Set(process.argv.slice(2));
const onlyChangelog = args.has("--changelog");
const onlyCredits = args.has("--credits");
const writeChangelog = !onlyCredits;
const writeCredits = !onlyChangelog;

const KIND_ORDER = { root: 0, app: 1, package: 2, module: 3 };

function die(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function writeSlimChangelog() {
  if (!existsSync(CHANGELOG_JSON)) {
    die(`Missing ${CHANGELOG_JSON} — run \`pnpm release --changelog\` first.`);
  }
  /** @type {Array<{ version: string | null; timestamp: number | null; commits: Array<{ id: string; message: string; group: string | null; breaking: boolean }> }>} */
  const raw = JSON.parse(readFileSync(CHANGELOG_JSON, "utf8"));
  const slim = raw
    .filter(
      (release) => Array.isArray(release.commits) && release.commits.length > 0
    )
    .map((release) => ({
      version: release.version ?? null,
      timestamp: release.timestamp ?? null,
      commits: release.commits.map((commit) => ({
        id: typeof commit.id === "string" ? commit.id.slice(0, 7) : "",
        message: commit.message ?? "",
        group: commit.group ?? null,
        breaking: Boolean(commit.breaking),
      })),
    }))
    .sort(
      (a, b) =>
        (b.timestamp ?? Number.MAX_SAFE_INTEGER) -
        (a.timestamp ?? Number.MAX_SAFE_INTEGER)
    );

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_CHANGELOG, `${JSON.stringify(slim)}\n`, "utf8");
  console.log(
    `✔ ${path.relative(ROOT, OUT_CHANGELOG)} (${slim.length} releases)`
  );
}

/** Collect package.json paths for the root + apps/packages/modules workspaces. */
function workspacePackageJsonPaths() {
  /** @type {string[]} */
  const paths = [path.join(ROOT, "package.json")];

  /**
   * @param {string} dir
   * @param {number} depth
   */
  function walk(dir, depth = 0) {
    if (depth > 5 || !existsSync(dir)) {
      return;
    }
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) {
        continue;
      }
      const full = path.join(dir, ent.name);
      if (!ent.isDirectory()) {
        continue;
      }
      const pkgPath = path.join(full, "package.json");
      if (existsSync(pkgPath)) {
        paths.push(pkgPath);
      }
      walk(full, depth + 1);
    }
  }

  for (const segment of ["apps", "packages", "modules"]) {
    walk(path.join(ROOT, segment));
  }
  return paths;
}

/**
 * @param {string} pkgPath
 * @returns {"root" | "app" | "package" | "module"}
 */
function workspaceKind(pkgPath) {
  const rel = path.relative(ROOT, path.dirname(pkgPath)).replaceAll("\\", "/");
  if (!rel || rel === ".") {
    return "root";
  }
  if (rel.startsWith("apps/")) {
    return "app";
  }
  if (rel.startsWith("packages/")) {
    return "package";
  }
  if (rel.startsWith("modules/")) {
    return "module";
  }
  return "package";
}

/**
 * @param {string} pkgName
 * @param {string} pkgPath
 */
function workspaceLabel(pkgName, pkgPath) {
  if (pkgName?.startsWith("@engenty/")) {
    return pkgName.slice("@engenty/".length);
  }
  if (pkgName && pkgName !== "engenty") {
    return pkgName;
  }
  const rel = path.relative(ROOT, path.dirname(pkgPath)).replaceAll("\\", "/");
  return rel && rel !== "." ? rel : "root";
}

/**
 * @returns {Array<{ id: string; kind: "root" | "app" | "package" | "module"; label: string; deps: Set<string> }>}
 */
function workspaceDirectDeps() {
  /** @type {Array<{ id: string; kind: "root" | "app" | "package" | "module"; label: string; deps: Set<string> }>} */
  const workspaces = [];
  for (const pkgPath of workspacePackageJsonPaths()) {
    /** @type {{ name?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }} */
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const kind = workspaceKind(pkgPath);
    const label = workspaceLabel(pkg.name ?? "", pkgPath);
    const id =
      path.relative(ROOT, path.dirname(pkgPath)).replaceAll("\\", "/") ||
      "root";
    /** @type {Set<string>} */
    const deps = new Set();
    for (const field of ["dependencies", "optionalDependencies"]) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (!name.startsWith("@engenty/")) {
          deps.add(name);
        }
      }
    }
    if (deps.size > 0) {
      workspaces.push({ id, kind, label, deps });
    }
  }
  return workspaces;
}

/**
 * @returns {Map<string, { name: string; version: string; license: string; homepage?: string }>}
 */
function licenseIndex(directNames) {
  const stdout = execFileSync("pnpm", ["licenses", "list", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  /** @type {Record<string, Array<{ name: string; versions?: string[]; license?: string; homepage?: string }>>} */
  const byLicense = JSON.parse(stdout);
  /** @type {Map<string, { name: string; version: string; license: string; homepage?: string }>} */
  const byName = new Map();

  for (const [licenseGroup, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      if (!(pkg?.name && directNames.has(pkg.name)) || byName.has(pkg.name)) {
        continue;
      }
      const version = pkg.versions?.[0] ?? "";
      const license = pkg.license || licenseGroup || "Unknown";
      const homepage =
        typeof pkg.homepage === "string" && pkg.homepage.trim()
          ? pkg.homepage.trim()
          : undefined;
      byName.set(pkg.name, {
        name: pkg.name,
        version,
        license,
        ...(homepage ? { homepage } : {}),
      });
    }
  }

  for (const name of directNames) {
    if (!byName.has(name)) {
      byName.set(name, { name, version: "", license: "Unknown" });
    }
  }
  return byName;
}

/**
 * @param {Iterable<string>} names
 * @param {Map<string, { name: string; version: string; license: string; homepage?: string }>} byName
 */
function packagesForNames(names, byName) {
  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map(
      (name) => byName.get(name) ?? { name, version: "", license: "Unknown" }
    );
}

function writeOssCredits() {
  const workspaces = workspaceDirectDeps();
  /** @type {Map<string, Set<string>>} */
  const declaredBy = new Map();
  for (const ws of workspaces) {
    for (const name of ws.deps) {
      if (!declaredBy.has(name)) {
        declaredBy.set(name, new Set());
      }
      declaredBy.get(name)?.add(ws.id);
    }
  }

  const directNames = new Set(declaredBy.keys());
  const byName = licenseIndex(directNames);

  const sharedNames = [...declaredBy.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([name]) => name);

  const groups = workspaces
    .map((ws) => {
      const unique = [...ws.deps].filter(
        (name) => (declaredBy.get(name)?.size ?? 0) === 1
      );
      return {
        id: ws.id,
        kind: ws.kind,
        label: ws.label,
        packages: packagesForNames(unique, byName),
      };
    })
    .filter((group) => group.packages.length > 0)
    .sort((a, b) => {
      const kindDiff = (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9);
      if (kindDiff !== 0) {
        return kindDiff;
      }
      return a.label.localeCompare(b.label);
    });

  const payload = {
    shared: packagesForNames(sharedNames, byName),
    groups,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_CREDITS, `${JSON.stringify(payload)}\n`, "utf8");
  const uniqueCount = groups.reduce((n, g) => n + g.packages.length, 0);
  console.log(
    `✔ ${path.relative(ROOT, OUT_CREDITS)} (${payload.shared.length} shared, ${uniqueCount} unique across ${groups.length} workspaces)`
  );
}

if (writeChangelog) {
  writeSlimChangelog();
}
if (writeCredits) {
  writeOssCredits();
}

// The minified JSON.stringify output above satisfies no formatter's opinion in
// particular; run it through Biome so `pnpm check`'s lint step (which runs
// Biome over changed files) doesn't fail on generated output every release.
const written = [
  ...(writeChangelog ? [OUT_CHANGELOG] : []),
  ...(writeCredits ? [OUT_CREDITS] : []),
];
if (written.length > 0) {
  execFileSync(
    "pnpm",
    ["exec", "biome", "format", "--write", ...written],
    { cwd: ROOT, stdio: "inherit" }
  );
}
