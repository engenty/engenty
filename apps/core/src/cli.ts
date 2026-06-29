import path from "node:path";
import { loadCoreRuntimeEnvFromCallerSrcDir } from "@engenty/environment/env";
import { Command } from "commander";
import { BANNER } from "./cli/banner.js";
import {
  registerAuthCommands,
  registerModuleOperationCommands,
} from "./cli/commands.js";
import { registerEnvCommands } from "./cli/env-setup/env-commands.js";
import { registerPluginCommands } from "./cli/plugin-commands.js";
import { shouldDeferPluginBoot } from "./cli/plugin-create/plugin-create-cli-path.js";
import { registerSkillsCommands } from "./cli/tools/skills-commands.js";
import { registerToolsCommands } from "./cli/tools/tools-commands.js";
import { createBootApiLogger, initEvlog, log } from "./observability/evlog.js";
import { resolveModulesDir } from "./plugins/discovery.js";
import { loadPlugins } from "./plugins/loader.js";

loadCoreRuntimeEnvFromCallerSrcDir(import.meta.url);

export function createCli(): Command {
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
  registerEnvCommands(program);
  registerPluginCommands(program);
  registerToolsCommands(program);
  registerSkillsCommands(program);
  registerModuleOperationCommands(program);

  if (shouldDeferPluginBoot()) {
    return program;
  }

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

  return program;
}
