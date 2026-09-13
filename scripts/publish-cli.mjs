#!/usr/bin/env node
/**
 * Publish packages/cli to npmjs as `engenty`: the door to a checkout
 * (`npx engenty create`), a server (`npx engenty deploy`) and a deployment
 * check (`npx engenty doctor --remote`), versioned with the release.
 *
 * The workspace package is `@engenty/cli` at a placeholder version. The
 * publish stages a copy under .engenty/publish-cli/ with the release name and
 * version and bakes in what the package needs outside a checkout:
 *   - release-manifest.json — version, the schemas the release exposes, the
 *     Supabase CLI pin
 *   - migrations/ — the release's aggregated migrations
 *   - templates/ — the prebuilt compose files, with the public image names
 *
 * The package is public, so everything baked in is the OPEN set: closed
 * modules (scripts/lib/closed-paths.mjs) contribute neither schemas nor SQL,
 * exactly as the public mirror strips them from engenty.plugins.
 *
 * Usage:
 *   node scripts/publish-cli.mjs --dry-run              # stage + npm pack
 *   node scripts/publish-cli.mjs --version=0.2.3         # publish (auth via ~/.npmrc)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildOutputContent,
  collectMigrations,
} from "./aggregate-module-migrations.mjs";
import { isClosedPath, readClosedPrefixes } from "./lib/closed-prefixes.mjs";
import { resolveMigrationOwners } from "./lib/migration-owners.mjs";
import { composeApiSchemasFromOwners } from "./supabase-sync-lib.mjs";

export const PUBLISHED_NAME = "engenty";
const PACKAGE_DIR = "packages/cli";
const STAGE_DIR = ".engenty/publish-cli";
const SHIPPED = ["dist", "lib", "wizard", "README.md"];
const TEMPLATES = [
  "docker-compose.prebuilt.yaml",
  "docker-compose.backend.prebuilt.yaml",
  "docker-compose.edge.prebuilt.yaml",
  "docker-compose.migrate.prebuilt.yaml",
  "blue-green.env.example",
];

/**
 * Pure transform: the package.json the release publishes with. Exported for
 * tests. Workspace deps vanish because `dist/bin.js` bundles them; only the
 * third-party runtime deps stay.
 */
export function transformCliManifestForPublish(pkg, { version, repository }) {
  const dependencies = Object.fromEntries(
    Object.entries(pkg.dependencies ?? {}).filter(
      ([name]) => !name.startsWith("@engenty/")
    )
  );
  return {
    name: PUBLISHED_NAME,
    version,
    description: pkg.description,
    license: "FSL-1.1-MIT",
    type: "module",
    bin: pkg.bin,
    files: pkg.files,
    engines: pkg.engines,
    dependencies,
    repository: { type: "git", url: repository },
    homepage: "https://github.com/engenty/engenty#readme",
    keywords: ["engenty", "cli", "ai-agents", "supabase"],
    publishConfig: { access: "public" },
  };
}

/** The mirror's image names: `engenty-pro-<service>` → `engenty-<service>`. */
export function publicImageNames(text) {
  return text.replaceAll(
    "ghcr.io/engenty/engenty-pro-",
    "ghcr.io/engenty/engenty-"
  );
}

function parseArgs(argv) {
  const args = { dryRun: false, version: "" };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--version=")) {
      args.version = arg.slice("--version=".length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function openOwners(root) {
  const closed = readClosedPrefixes();
  return resolveMigrationOwners(root).filter(
    (owner) => !isClosedPath(path.relative(root, owner.migrationsPath), closed)
  );
}

function bakeMigrations(owners, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const migrations = collectMigrations(owners);
  for (const { ownerKind, ownerName, basename, sourcePath } of migrations) {
    fs.writeFileSync(
      path.join(outDir, basename),
      buildOutputContent(
        fs.readFileSync(sourcePath, "utf8"),
        ownerKind,
        ownerName,
        basename
      )
    );
  }
  return migrations.length;
}

function readSupabaseCliPin(root) {
  const source = fs.readFileSync(
    path.join(root, PACKAGE_DIR, "src", "supabase-cli-version.ts"),
    "utf8"
  );
  const pin = source.match(/SUPABASE_CLI_VERSION = "([^"]+)"/)?.[1];
  if (!pin) {
    throw new Error(
      "SUPABASE_CLI_VERSION not found in supabase-cli-version.ts"
    );
  }
  return pin;
}

/**
 * The built bundle must not carry closed code. A closed path string inside
 * dist/ means a closed module's source was imported into the CLI.
 */
function assertNoClosedLeak(stageDir) {
  const closed = readClosedPrefixes();
  const distDir = path.join(stageDir, "dist");
  for (const file of fs.readdirSync(distDir)) {
    const text = fs.readFileSync(path.join(distDir, file), "utf8");
    const hit = closed.find((prefix) => text.includes(prefix));
    if (hit) {
      throw new Error(
        `dist/${file} mentions the closed path "${hit}" — the CLI bundle must stay open.`
      );
    }
  }
}

export function stage(root, { version }) {
  const packageDir = path.join(root, PACKAGE_DIR);
  const stageDir = path.join(root, STAGE_DIR);
  if (!fs.existsSync(path.join(packageDir, "dist", "bin.js"))) {
    throw new Error("packages/cli/dist is missing — build @engenty/cli first.");
  }
  fs.rmSync(stageDir, { force: true, recursive: true });
  fs.mkdirSync(stageDir, { recursive: true });

  for (const entry of SHIPPED) {
    const source = path.join(packageDir, entry);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(stageDir, entry), { recursive: true });
    }
  }

  const remote = execFileSync("git", ["remote", "get-url", "origin"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const manifest = transformCliManifestForPublish(
    readJson(path.join(packageDir, "package.json")),
    {
      version,
      repository: /engenty-pro/.test(remote)
        ? "https://github.com/engenty/engenty.git"
        : remote,
    }
  );
  fs.writeFileSync(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  const owners = openOwners(root);
  const migrationCount = bakeMigrations(
    owners,
    path.join(stageDir, "migrations")
  );
  const schemas = composeApiSchemasFromOwners(owners);

  const templateDir = path.join(stageDir, "templates");
  fs.mkdirSync(templateDir);
  for (const name of TEMPLATES) {
    fs.writeFileSync(
      path.join(templateDir, name),
      publicImageNames(fs.readFileSync(path.join(root, "deploy", name), "utf8"))
    );
  }

  const release = {
    version,
    schemas,
    migrationsDir: "migrations",
    supabaseCliVersion: readSupabaseCliPin(root),
  };
  fs.writeFileSync(
    path.join(stageDir, "release-manifest.json"),
    `${JSON.stringify(release, null, 2)}\n`
  );

  assertNoClosedLeak(stageDir);
  return { stageDir, migrationCount, schemas, manifest };
}

function main() {
  const { dryRun, version } = parseArgs(process.argv.slice(2));
  if (!(version || dryRun)) {
    throw new Error("--version=<x.y.z> is required for a real publish");
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const effectiveVersion =
    version || readJson(path.join(root, "package.json")).version;
  const { stageDir, migrationCount, schemas, manifest } = stage(root, {
    version: effectiveVersion,
  });
  console.log(
    `staged ${manifest.name}@${manifest.version}: ${schemas.length} schemas, ${migrationCount} migrations, ${TEMPLATES.length} templates → ${path.relative(root, stageDir)}`
  );
  const args = dryRun
    ? ["publish", "--dry-run", "--access", "public"]
    : ["publish", "--access", "public"];
  execFileSync("npm", args, { cwd: stageDir, stdio: "inherit" });
  console.log(
    dryRun
      ? "publish-cli: dry-run only"
      : `publish-cli: published ${manifest.name}@${manifest.version}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
