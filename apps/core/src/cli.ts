import path from "node:path";
import { loadCoreRuntimeEnvFromCallerSrcDir } from "@engenty/environment/env";
import { Command } from "commander";
import { BANNER } from "./cli/banner.js";
import {
  registerAuthCommands,
  registerModuleOperationCommands,
} from "./cli/commands.js";
import { registerDbCommands } from "./cli/db/db-commands.js";
import { registerDoctorCommands } from "./cli/doctor/doctor-commands.js";
import { registerEnvCommands } from "./cli/env-setup/env-commands.js";
import { registerModulesCommands } from "./cli/module-commands.js";
import { registerPluginCommands } from "./cli/plugin-commands.js";
import { shouldDeferPluginBoot } from "./cli/plugin-create/plugin-create-cli-path.js";
import { registerServiceCredentialCommands } from "./cli/service-credential-commands.js";
import { registerSetupCommands } from "./cli/setup/setup-commands.js";
import { registerSkillsCommands } from "./cli/tools/skills-commands.js";
import { registerToolsCommands } from "./cli/tools/tools-commands.js";
import { createBootApiLogger, initEvlog, log } from "./observability/evlog.js";
import { resolveModulesDir } from "./plugins/discovery.js";

loadCoreRuntimeEnvFromCallerSrcDir(import.meta.url);

export async function createCli(): Promise<Command> {
  const program = new Command("engenty")
    .description("Modular agent-friendly business app")
    .version("0.0.1");

  program.addHelpText("before", (context) => {
    if (context.command === program) {
      return `${BANNER}\n`;
    }
    return "";
  });

  const dataDir = path.resolve(process.cwd(), "data");
  const resolvePath = (p: string) => path.resolve(dataDir, p);

  initEvlog();

  const existingCommands = new Set(program.commands.map((c) => c.name()));
  registerAuthCommands(program);
  registerServiceCredentialCommands(program);
  registerEnvCommands(program);
  registerSetupCommands(program);
  registerDoctorCommands(program);
  registerDbCommands(program);
  registerPluginCommands(program);
  registerModulesCommands(program);
  registerToolsCommands(program);
  registerSkillsCommands(program);
  registerModuleOperationCommands(program);

  // A command group invoked without a subcommand should print its help and
  // exit 0, not exit 1. The non-zero exit otherwise cascades through pnpm as
  // ERR_PNPM_RECURSIVE_EXEC / ELIFECYCLE on `pnpm engenty <group>`.
  defaultToHelpForGroups(program);

  if (shouldDeferPluginBoot()) {
    return program;
  }

  const { loadPlugins } = await import("./plugins/loader.js");
  const registry = loadPlugins({
    modulesDir: resolveModulesDir(),
    dataDir,
    config: {},
    logger: createBootApiLogger(),
    startRegisteredServices: false,
  });

  for (const entry of registry.cliRegistrars) {
    if (entry.commands.length > 0) {
      const overlaps = entry.commands.filter((c) => existingCommands.has(c));
      if (overlaps.length > 0) {
        continue;
      }
    }
    try {
      entry.register({
        program,
        config: {},
        dataDir,
        resolvePath,
      });
      for (const cmd of entry.commands) {
        existingCommands.add(cmd);
      }
    } catch (err) {
      log.warn(
        "cli",
        `Plugin CLI register failed (${entry.pluginId}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Re-apply to cover any plugin-contributed groups registered above.
  defaultToHelpForGroups(program);

  return program;
}

/**
 * Recursively give every command that has subcommands but no action handler a
 * default action that prints help to stdout and exits 0. Idempotent: commands
 * that already have an action (including ones we added) are left untouched.
 */
function defaultToHelpForGroups(command: Command): void {
  for (const sub of command.commands) {
    defaultToHelpForGroups(sub);
  }
  const hasSubcommands = command.commands.length > 0;
  // `_actionHandler` is commander-internal; absent when no `.action()` was set.
  const hasAction = Boolean(
    (command as unknown as { _actionHandler?: unknown })._actionHandler
  );
  if (hasSubcommands && !hasAction) {
    command.action(() => {
      command.outputHelp();
    });
  }
}
