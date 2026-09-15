import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { printBanner } from "../banner.js";
import { runCliAction } from "../cli-errors.js";
import {
  checkResultToJson,
  renderScopeReport,
  runEnvCheck,
} from "./env-check.js";
import { runEnvEdit } from "./env-edit.js";
import { renderExampleFile } from "./env-example-render.js";
import {
  currentWorkspaceRootOrNull,
  exampleFilePath,
  resolveWorkspaceRoot,
} from "./env-files.js";
import type { EnvScope } from "./env-manifest-types.js";
import { runEnvMenu } from "./env-menu.js";
import { runEnvSet } from "./env-set.js";
import { runEnvGenerate, runEnvInitWizard } from "./env-wizard.js";

/** What `--scope all` sweeps: the checkout's own files. */
const ALL_SCOPES: EnvScope[] = ["root", "deploy"];
/** Also accepted by name — `home` is a managed install, not part of a sweep. */
const NAMED_SCOPES: EnvScope[] = [...ALL_SCOPES, "home"];

function parseScopes(
  raw: string | undefined,
  fallback: EnvScope[]
): EnvScope[] {
  if (!raw || raw === "all") {
    return raw === "all" ? ALL_SCOPES : fallback;
  }
  const scopes = raw.split(",").map((part) => part.trim());
  const invalid = scopes.filter(
    (scope) => !NAMED_SCOPES.includes(scope as EnvScope)
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --scope: ${invalid.join(", ")} (use root, deploy, home, or all)`
    );
  }
  return scopes as EnvScope[];
}

function runExample(options: {
  check?: boolean;
  root?: string;
  write?: boolean;
}): number {
  const workspaceRoot = options.root
    ? path.resolve(options.root)
    : resolveWorkspaceRoot();
  let drifted = 0;
  for (const scope of ALL_SCOPES) {
    const filePath = exampleFilePath(workspaceRoot, scope);
    const rendered = renderExampleFile(scope, workspaceRoot);
    if (options.write) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, rendered, "utf8");
      console.log(`Wrote ${filePath}`);
      continue;
    }
    const current = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, "utf8")
      : null;
    if (current !== rendered) {
      drifted++;
      console.error(
        `${filePath} ${current === null ? "is missing" : "drifted from the manifest"} — run: pnpm env:example:write`
      );
    }
  }
  if (options.write) {
    return 0;
  }
  if (drifted === 0) {
    console.log("Env example files match the manifest.");
    return 0;
  }
  return 1;
}

export function registerEnvCommands(program: Command): void {
  const env = program
    .command("env")
    .description(
      "Set up and manage .env files — interactive menu; subcommands via --help"
    )
    .option(
      "--init",
      "Run the first-run wizard (same as engenty env init) instead of the menu"
    )
    .option(
      "--scope <scopes>",
      "With --init: comma-separated root, deploy, or all (default: root)"
    )
    // Bare `engenty env` starts the interactive menu (help stays on --help/-h).
    .action(async (options: { init?: boolean; scope?: string }) => {
      printBanner();
      if (options.init === true) {
        const scopes = parseScopes(options.scope, ["root"]);
        process.exitCode = await runEnvInitWizard(scopes);
        return;
      }
      process.exitCode = await runEnvMenu();
    });

  env
    .command("init")
    .description("Interactive first-run wizard; idempotent gap-fill on rerun")
    .option(
      "--scope <scopes>",
      "Comma-separated: root, deploy, or all (default: root)"
    )
    .action(async (options: { scope?: string }) => {
      const scopes = parseScopes(options.scope, ["root"]);
      printBanner();
      process.exitCode = await runEnvInitWizard(scopes);
    });

  env
    .command("check")
    .description(
      "Report missing/empty/invalid env vars; exits 1 when required values are missing"
    )
    .option("--json", "Machine-readable output")
    .option(
      "--scope <scopes>",
      "Comma-separated: root, deploy, home, or all (default: root)"
    )
    .action((options: { json?: boolean; scope?: string }) => {
      const scopes = parseScopes(options.scope, ["root"]);
      const workspaceRoot = scopes.every((scope) => scope === "home")
        ? ""
        : resolveWorkspaceRoot();
      const result = runEnvCheck(workspaceRoot, scopes);
      if (options.json) {
        console.log(
          JSON.stringify(checkResultToJson(workspaceRoot, result), null, 2)
        );
      } else {
        console.log(
          result.reports
            .map((report) => renderScopeReport(workspaceRoot, report))
            .join("\n\n")
        );
        if (result.hasRequiredGaps) {
          console.error(
            "\nRequired values missing — run pnpm engenty env init to fill the gaps."
          );
        }
      }
      if (result.hasRequiredGaps) {
        process.exitCode = 1;
      }
    });

  env
    .command("set")
    .description("Set one variable without prompting")
    .argument("<key>", "Variable name")
    .argument("<value>", "New value")
    .option("--scope <scope>", "root, deploy or home (default: root)")
    .option("--force", "Write a key the manifest does not know")
    .action(
      runCliAction(
        (
          key: string,
          value: string,
          options: { force?: boolean; scope?: string },
          command: Command
        ) => {
          // The parent `env` declares `--scope` too, and commander hands a
          // flag to whichever command parses it first — so a trailing
          // `--scope home` lands on the parent. Fall back to it.
          const raw =
            options.scope ??
            (command.parent?.opts() as { scope?: string } | undefined)?.scope;
          const [scope] = parseScopes(raw, ["root"]);
          const workspaceRoot = currentWorkspaceRootOrNull();
          runEnvSet({
            force: options.force === true,
            key,
            manifestComplete: workspaceRoot !== null,
            scope,
            value,
            workspaceRoot: workspaceRoot ?? "",
          });
        }
      )
    );

  env
    .command("edit")
    .description("Edit a single env variable interactively")
    .argument("[key]", "Variable name (omit to pick from a list)")
    .action(async (key: string | undefined) => {
      printBanner();
      process.exitCode = await runEnvEdit(key);
    });

  env
    .command("generate")
    .description("Generate missing local secrets (JWT secret, inbox enc key)")
    .option("--force", "Rotate secrets that are already set (asks first)")
    .action(async (options: { force?: boolean }) => {
      process.exitCode = await runEnvGenerate(options.force === true);
    });

  env
    .command("example")
    .description("Regenerate .env.example files from the manifest")
    .option("--write", "Write the templates")
    .option("--check", "Exit 1 when templates drift from the manifest (CI)")
    // The manifest is assembled from the `engenty.plugin.json` files present
    // on disk, so a tree with fewer modules documents fewer variables. The
    // open-source snapshot renders the mirror's templates from the filtered
    // tree it is about to publish, which is not the tree this CLI runs in.
    .option("--root <dir>", "Render for this workspace instead of the cwd's")
    .action((options: { check?: boolean; root?: string; write?: boolean }) => {
      process.exitCode = runExample(options);
    });
}
