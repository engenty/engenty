/**
 * Resolve the workspace-vendored Supabase CLI (`devDependency: supabase`).
 * Keep in sync with `packages/cli/src/db/supabase-cli-bin.ts`.
 */
import fs from "node:fs";
import path from "node:path";

export function resolveSupabaseCliBin(root) {
  const name = process.platform === "win32" ? "supabase.CMD" : "supabase";
  const bin = path.join(root, "node_modules", ".bin", name);
  if (!fs.existsSync(bin)) {
    throw new Error(
      "Supabase CLI is not installed. Run `pnpm install` — it is a workspace dependency, not a global tool."
    );
  }
  return bin;
}
