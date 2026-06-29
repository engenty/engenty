import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { printBanner } from "../banner.js";
import {
  checkResultToJson,
  renderScopeReport,
  runEnvCheck,
} from "./env-check.js";
import { runEnvEdit } from "./env-edit.js";
import { renderExampleFile } from "./env-example-render.js";
import { exampleFilePath, resolveWorkspaceRoot } from "./env-files.js";
import type { EnvScope } from "./env-manifest-types.js";
import { runEnvMenu } from "./env-menu.js";
import { runEnvGenerate, runEnvInitWizard } from "./env-wizard.js";

const ALL_SCOPES: EnvScope[] = ["root", "deploy"];

function parseScopes(
  raw: string | undefined,
  fallback: EnvScope[]
): EnvScope[] {
  if (!raw || raw === "all") {
    return raw === "all" ? ALL_SCOPES : fallback;
  }
  const scopes = raw.split(",").map((part) => part.trim());
  const invalid = scopes.filter(
    (scope) => !ALL_SCOPES.includes(scope as EnvScope)
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --scope: ${invalid.join(", ")} (use root, deploy, or all)`
    );
  }
  return scopes as EnvScope[];
}

function runExample(options: { check?: boolean; write?: boolean }): number {
  const workspaceRoot = resolveWorkspaceRoot();
  let drifted = 0;
  for (const scope of ALL_SCOPES) {
    const filePath = exampleFilePath(workspaceRoot, scope);
    const rendered = renderExampleFile(scope);
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
    // Bare `engenty env` starts the interactive menu (help stays on --help/-h).
    .action(async () => {
      printBanner();
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
      "Comma-separated: root, deploy, or all (default: root)"
    )
    .action((options: { json?: boolean; scope?: string }) => {
      const scopes = parseScopes(options.scope, ["root"]);
      const workspaceRoot = resolveWorkspaceRoot();
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
            "\nRequired values missing — run pnpm env:setup to fill the gaps."
          );
        }
      }
      if (result.hasRequiredGaps) {
        process.exitCode = 1;
      }
    });

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
    .action((options: { check?: boolean; write?: boolean }) => {
      process.exitCode = runExample(options);
    });
}
