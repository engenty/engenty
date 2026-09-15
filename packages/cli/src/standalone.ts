import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { BANNER } from "./banner.js";
import { runCliAction } from "./cli-errors.js";
import { registerCreateCommand } from "./create/create-commands.js";
import { registerDeployCommands } from "./deploy/deploy-commands.js";
import { registerDoctorCommands } from "./doctor/doctor-commands.js";
import { registerEnvCommands } from "./env-setup/env-commands.js";
import { dim } from "./env-setup/env-style.js";
import { registerLocalCommands } from "./local/local-commands.js";
import {
  cliVersion,
  currentWorkspaceRoot,
  workspaceVersion,
} from "./workspace.js";

/** Commands that only make sense inside a checkout, and say so outside one. */
export const CHECKOUT_ONLY_COMMANDS = [
  "setup",
  "generate",
  "dev",
  "reset",
  "db",
  "install",
  "plugins",
  "auth",
  "tools",
  "skills",
  "modules",
] as const;

export type Invocation =
  | { kind: "delegate"; root: string }
  | { kind: "standalone" };

/**
 * Inside a checkout, every command is the checkout's own — its version of the
 * code, plus whatever installed plugins register — so the package hands the
 * whole argv to `pnpm engenty`. The one exception is `create`, which refuses
 * to nest checkouts. Outside, the package's own bundle answers.
 */
export function resolveInvocation(
  args: readonly string[],
  root: string | null = currentWorkspaceRoot()
): Invocation {
  if (root && args[0] !== "create") {
    return { kind: "delegate", root };
  }
  return { kind: "standalone" };
}

export function delegateToCheckout(
  root: string,
  args: readonly string[]
): number {
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    console.error(
      `${root} is an engenty checkout without node_modules — run \`pnpm install\` there first.`
    );
    return 1;
  }
  const checkoutVersion = workspaceVersion(root);
  const ownVersion = cliVersion();
  if (checkoutVersion && checkoutVersion !== ownVersion) {
    console.error(
      dim(
        `engenty ${ownVersion} → running this checkout's ${checkoutVersion} at ${root}`
      )
    );
  }
  const result = spawnSync("pnpm", ["engenty", ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) {
    console.error("pnpm is not on PATH — `corepack enable` installs it.");
    return 1;
  }
  return result.status ?? 1;
}

function registerCheckoutOnlyCommands(program: Command): void {
  for (const name of CHECKOUT_ONLY_COMMANDS) {
    program
      .command(name, { hidden: true })
      .allowUnknownOption()
      .allowExcessArguments()
      .argument("[args...]")
      .action(
        runCliAction(() => {
          throw new Error(
            `engenty ${name} runs inside a checkout. Get one with \`npx engenty create <dir>\`, or cd into an existing checkout — there, every command is available.`
          );
        })
      );
  }
}

export function createStandaloneCli(): Command {
  const program = new Command("engenty")
    .description(
      "engenty from anywhere: run it on this machine, get a checkout, deploy to a server, check a machine or a deployment. Inside a checkout, every command runs through the checkout's own CLI."
    )
    .version(cliVersion());
  program.addHelpText("before", (context) =>
    context.command === program ? `${BANNER}\n` : ""
  );
  registerCreateCommand(program);
  registerLocalCommands(program);
  registerDeployCommands(program);
  registerDoctorCommands(program);
  // Only `set` and `check --scope home` are meaningful without a checkout; the
  // wizards below them resolve a workspace root and say so when there is none.
  registerEnvCommands(program);
  registerCheckoutOnlyCommands(program);
  return program;
}

export async function runStandaloneCli(
  argv: readonly string[]
): Promise<number> {
  const args = argv.slice(2);
  const invocation = resolveInvocation(args);
  if (invocation.kind === "delegate") {
    return delegateToCheckout(invocation.root, args);
  }
  await createStandaloneCli().parseAsync([...argv]);
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}
