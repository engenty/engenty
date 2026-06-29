/**
 * True when argv targets lightweight commands that must run without plugin boot.
 * Fresh installs only have source — the plugin host needs built workspace packages.
 *
 * Keep in sync with scripts/lib/should-defer-plugin-boot.mjs
 */
export function shouldDeferPluginBoot(
  argv: readonly string[] = process.argv
): boolean {
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
