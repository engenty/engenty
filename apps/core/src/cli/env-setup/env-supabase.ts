import { execFile } from "node:child_process";
import { resolveSupabaseCliBinFromCwd } from "../db/supabase-cli-bin.js";

export interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

export type CommandRunner = (
  command: string,
  args: readonly string[]
) => Promise<CommandResult>;

const defaultRunner: CommandRunner = (command, args) =>
  new Promise((resolve) => {
    const bin =
      command === "supabase" ? resolveSupabaseCliBinFromCwd() : command;
    execFile(bin, [...args], { timeout: 30_000 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ code: 0, stderr, stdout });
        return;
      }
      const rawCode = (error as { code?: number | string }).code;
      resolve({
        code: typeof rawCode === "number" ? rawCode : 1,
        stderr: stderr || error.message,
        stdout,
      });
    });
  });

/** Parse `supabase status -o env` stdout: KEY="VALUE" lines (stderr noise ignored). */
export function parseSupabaseStatusEnv(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
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

/** A 3-part `eyJ…`-prefixed HS256 token, e.g. the legacy ANON_KEY/SERVICE_ROLE_KEY. */
function isJwtLike(value: string): boolean {
  return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value.trim());
}

/**
 * Walk ordered key-name fallbacks (new sb_* keys first, legacy JWT keys after).
 *
 * With `preferJwt`, a JWT-shaped candidate wins regardless of order. The local
 * Supabase CLI stack validates JWTs against JWT_SECRET (HS256) and does not
 * accept the new single-part sb_secret_/sb_publishable_ keys unless asymmetric
 * signing keys are configured — so the wizard must write the legacy JWT keys for
 * local dev, otherwise PostgREST rejects every request (`PGRST301`).
 */
export function resolveSupabaseValue(
  statusKeys: readonly string[],
  statusValues: Record<string, string>,
  opts: { preferJwt?: boolean } = {}
): string | undefined {
  if (opts.preferJwt) {
    for (const key of statusKeys) {
      const value = statusValues[key];
      if (value && isJwtLike(value)) {
        return value;
      }
    }
  }
  for (const key of statusKeys) {
    const value = statusValues[key];
    if (value && value.trim() !== "") {
      return value;
    }
  }
  return;
}

export interface SupabaseHarvest {
  error?: string;
  ok: boolean;
  values: Record<string, string>;
}

export async function harvestSupabaseStatus(
  runner: CommandRunner = defaultRunner
): Promise<SupabaseHarvest> {
  let result: CommandResult;
  try {
    result = await runner("supabase", ["status", "-o", "env"]);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      ok: false,
      values: {},
    };
  }
  const values = parseSupabaseStatusEnv(result.stdout);
  if (result.code !== 0 || Object.keys(values).length === 0) {
    return {
      error:
        result.stderr.trim() ||
        "supabase status returned no values — is the local stack running? (pnpm supabase:start)",
      ok: false,
      values: {},
    };
  }
  return { ok: true, values };
}
