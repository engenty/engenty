import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findEngentyRepoRootFrom } from "@engenty/environment";
import type { Command } from "commander";
import { parseModuleAddSpec } from "./module-add-spec.js";

function readRootVersion(repoRoot: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8")
    ) as { version?: string };
    return pkg.version;
  } catch {
    return;
  }
}

interface ModuleAddOptions {
  dbMigrate?: boolean;
  install?: boolean;
  slug?: string;
}

/**
 * Add the `engenty.plugins.<slug>` registry entry to the root package.json,
 * preserving formatting/indent. Idempotent: re-adding the same slug is a no-op.
 */
function writeRegistryPluginEntry(
  repoRoot: string,
  slug: string,
  entry: { source: "registry"; package?: string }
): void {
  const pkgPath = path.join(repoRoot, "package.json");
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as {
    engenty?: { plugins?: Record<string, unknown> };
  };
  pkg.engenty ??= {};
  pkg.engenty.plugins ??= {};
  pkg.engenty.plugins[slug] = entry;
  const indent = raw.match(/^(\s+)"/m)?.[1] ?? "  ";
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`);
}

function run(repoRoot: string, cmd: string, args: string[]): void {
  execFileSync(cmd, args, { cwd: repoRoot, stdio: "inherit" });
}

function addModule(packageArg: string, options: ModuleAddOptions): void {
  const spec = parseModuleAddSpec(packageArg, options.slug);
  const repoRoot = findEngentyRepoRootFrom(process.cwd());

  // Guard against shadowing a workspace module (e.g. running this in the
  // monorepo). `modules add` is for an installed/consumer instance where the
  // module comes from the registry, not the workspace.
  if (fs.existsSync(path.join(repoRoot, "modules", spec.slug))) {
    throw new Error(
      `A workspace module already exists at modules/${spec.slug}. ` +
        "`modules add` installs from the registry and is meant for a deployed " +
        "instance, not the monorepo."
    );
  }

  console.log(`Installing ${spec.installArg} …`);
  if (options.install !== false) {
    run(repoRoot, "pnpm", ["add", "-w", spec.installArg]);
  }

  writeRegistryPluginEntry(repoRoot, spec.slug, spec.pluginEntry);
  console.log(`Registered engenty.plugins.${spec.slug} (source: registry).`);

  console.log("Regenerating plugin artifacts + aggregating migrations …");
  run(repoRoot, "pnpm", ["engenty", "setup"]);

  if (options.dbMigrate === true) {
    console.log("Applying module migrations …");
    run(repoRoot, "pnpm", ["engenty", "db", "migrate"]);
  }

  const platformVersion = readRootVersion(repoRoot);
  console.log(
    [
      "",
      `✔ Added ${spec.packageName}${spec.version ? `@${spec.version}` : ""} as "${spec.slug}".`,
      "",
      "Next steps:",
      options.dbMigrate === true
        ? null
        : "  • Apply its migrations:  pnpm engenty db migrate",
      // The prod PostgREST schema exposure is a deliberate, environment-specific
      // step — never fired automatically at a remote database from here.
      "  • On a cloud/prod database, expose the module schema in PostgREST:",
      `      add "module_${spec.slug}" to the project's exposed schemas (PATCH pgrst.db_schemas),`,
      `      otherwise the module's API returns 404 for its tables.`,
      platformVersion
        ? `  • This platform is v${platformVersion}; install a matching module version for lockstep.`
        : null,
    ]
      .filter((line) => line !== null)
      .join("\n")
  );
}

export function registerModulesCommands(program: Command): void {
  const modules = program
    .command("modules")
    .description("Manage modules installed from the registry");

  modules
    .command("add <package>")
    .description(
      "Install a module from the registry and register it (e.g. @engenty/tasks@0.1.47)"
    )
    .option("--slug <slug>", "plugin slug if it differs from the package name")
    .option("--db-migrate", "apply the module's migrations after install")
    .option("--no-install", "skip `pnpm add` (only register + setup)")
    .action((packageArg: string, options: ModuleAddOptions) => {
      addModule(packageArg, options);
    });
}
