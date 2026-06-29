import { intro, isCancel, outro, select } from "@clack/prompts";
import {
  buildScopeReport,
  renderScopeReport,
  runEnvCheck,
} from "./env-check.js";
import { requiredGaps } from "./env-diff.js";
import { runEnvEdit } from "./env-edit.js";
import { resolveWorkspaceRoot } from "./env-files.js";
import type { EnvScope } from "./env-manifest-types.js";
import { runEnvGenerate, runEnvInitWizard } from "./env-wizard.js";

const LOCAL_SCOPES: EnvScope[] = ["root"];

type MenuAction = "check" | "edit" | "exit" | "generate" | "init";

function gapSummary(workspaceRoot: string): string {
  let missingFiles = 0;
  let gaps = 0;
  for (const scope of LOCAL_SCOPES) {
    const report = buildScopeReport(workspaceRoot, scope);
    if (report.fileExists) {
      gaps += requiredGaps(report).length;
    } else {
      missingFiles++;
    }
  }
  if (missingFiles > 0) {
    return `${missingFiles} env file(s) missing`;
  }
  return gaps === 0
    ? "all required values set"
    : `${gaps} required value(s) missing`;
}

function printCheck(workspaceRoot: string): void {
  const result = runEnvCheck(workspaceRoot, LOCAL_SCOPES);
  console.log(
    `\n${result.reports
      .map((report) => renderScopeReport(workspaceRoot, report))
      .join("\n\n")}\n`
  );
}

/** Interactive top-level menu for a bare `engenty env`. */
export async function runEnvMenu(): Promise<number> {
  const workspaceRoot = resolveWorkspaceRoot();
  intro("Engenty environment");

  for (;;) {
    const action = await select<MenuAction>({
      message: `What do you want to do? (${gapSummary(workspaceRoot)})`,
      options: [
        {
          hint: "create files, generate secrets, pull Supabase keys, provider keys",
          label: "Run setup wizard",
          value: "init",
        },
        {
          hint: "report missing / empty / invalid values",
          label: "Check for gaps",
          value: "check",
        },
        {
          hint: "pick a variable and change its value",
          label: "Edit a variable",
          value: "edit",
        },
        {
          hint: "JWT secret, inbox encryption key",
          label: "Generate missing secrets",
          value: "generate",
        },
        { label: "Exit", value: "exit" },
      ],
    });
    if (isCancel(action) || action === "exit") {
      outro("Done.");
      return 0;
    }

    switch (action) {
      case "init": {
        await runEnvInitWizard(LOCAL_SCOPES);
        break;
      }
      case "check": {
        printCheck(workspaceRoot);
        break;
      }
      case "edit": {
        await runEnvEdit();
        break;
      }
      case "generate": {
        await runEnvGenerate(false);
        break;
      }
      default:
        break;
    }
  }
}
