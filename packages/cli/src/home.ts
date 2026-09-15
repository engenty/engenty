import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where a managed install lives: the `.env`, the compose files, the generated
 * `supabase/config.toml` and the release that wrote them.
 *
 * `~/.engenty`, not a folder in the current directory. The databases are named
 * Docker volumes, so a cwd-relative folder would be configuration pretending to
 * be the installation — and `engenty start` from a different directory would
 * silently build a second one instead of finding the first.
 *
 * `engenty deploy` is the other case and keeps writing `./engenty-deploy`: on a
 * server that folder is the deliverable the operator owns and backs up.
 */
export function engentyHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.ENGENTY_HOME ?? "").trim();
  return override === "" ? path.join(os.homedir(), ".engenty") : override;
}

export function ensureEngentyHome(home = engentyHome()): string {
  fs.mkdirSync(path.join(home, "supabase"), { recursive: true });
  return home;
}

export function homeExists(home = engentyHome()): boolean {
  return fs.existsSync(path.join(home, ".env"));
}

const VERSION_FILE = "version";

/** The release that last wrote this install — what `update` compares against. */
export function readInstallVersion(home = engentyHome()): string | null {
  const file = path.join(home, VERSION_FILE);
  if (!fs.existsSync(file)) {
    return null;
  }
  const value = fs.readFileSync(file, "utf8").trim();
  return value === "" ? null : value;
}

export function writeInstallVersion(
  version: string,
  home = engentyHome()
): void {
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, VERSION_FILE), `${version}\n`, "utf8");
}
