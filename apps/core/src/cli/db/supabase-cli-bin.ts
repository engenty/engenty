import fs from "node:fs";
import path from "node:path";

/**
 * Workspace-vendored Supabase CLI (`devDependency: supabase` at the repo root).
 * Keep in sync with `scripts/lib/supabase-cli.mjs`.
 */
export function resolveSupabaseCliBin(repoRoot: string): string {
  const name = process.platform === "win32" ? "supabase.CMD" : "supabase";
  const bin = path.join(repoRoot, "node_modules", ".bin", name);
  if (!fs.existsSync(bin)) {
    throw new Error(
      "Supabase CLI is not installed. Run `pnpm install` — it is a workspace dependency, not a global tool."
    );
  }
  return bin;
}

/** Walk from `start` toward filesystem root until the workspace `.bin` shim exists. */
export function resolveSupabaseCliBinFromCwd(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 20; i++) {
    try {
      return resolveSupabaseCliBin(dir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  throw new Error(
    "Supabase CLI is not installed. Run `pnpm install` — it is a workspace dependency, not a global tool."
  );
}
