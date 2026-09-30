import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

/** `.env` / `.env.*` — the files `scripts/purge.sh` deletes; never templates or earlier backups. */
function isLocalEnvFile(name: string): boolean {
  if (name.endsWith(".example") || name.endsWith(".bak")) {
    return false;
  }
  return name === ".env" || name.startsWith(".env.");
}

/**
 * Copies every local env file to `<name>.bak` next to it (overwriting an
 * earlier backup) so a reset does not lose keys and dev credentials.
 * Returns the backed-up paths, relative to `root`.
 */
export function backupEnvFiles(root: string): string[] {
  const saved: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(full);
        }
      } else if (entry.isFile() && isLocalEnvFile(entry.name)) {
        fs.copyFileSync(full, `${full}.bak`);
        saved.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return saved;
}
