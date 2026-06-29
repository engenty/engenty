// Load repo `.env.local` so tests can connect to the local Supabase stack
// without each developer having to export shell env vars. Mirrors the
// pattern apps/core uses through tsx/dotenv but stays vitest-local so the
// package can run in isolation.

import fs from "node:fs";
import path from "node:path";

function readDotenv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const envLocal = readDotenv(path.join(repoRoot, ".env.local"));
for (const [k, v] of Object.entries(envLocal)) {
  if (!process.env[k]) {
    process.env[k] = v;
  }
}
