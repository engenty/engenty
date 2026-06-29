/**
 * True when argv targets lightweight commands that must run without plugin boot:
 * plugin scaffold/wire commands, and `engenty env *` (a broken/missing env must
 * not break the command that fixes it).
 */
export function shouldDeferPluginBoot(
  argv: readonly string[] = process.argv
): boolean {
  const args = argv.slice(2);
  if (args[0] === "env") {
    return true;
  }
  const pluginsIndex = args.indexOf("plugins");
  if (pluginsIndex === -1) {
    return false;
  }
  return args
    .slice(pluginsIndex + 1)
    .some((arg) => arg === "create" || arg === "wire-ui");
}
