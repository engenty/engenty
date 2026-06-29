/**
 * Keep in sync with apps/core/src/cli/plugin-create/plugin-create-cli-path.ts
 */
export function shouldDeferPluginBoot(argv) {
  const args = argv.slice(2);
  if (args.length === 0) {
    return true;
  }
  if (args.every((arg) => arg.startsWith("-"))) {
    return true;
  }

  const command = args[0];
  if (
    command === "env" ||
    command === "setup" ||
    command === "init" ||
    command === "db" ||
    command === "plugins"
  ) {
    return true;
  }

  return false;
}
