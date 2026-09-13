import fs from "node:fs";
import path from "node:path";

/**
 * The port the checkout's own Supabase stack answers on: `[api] port` in
 * `supabase/config.toml`. Null when there is no local config (a deployment).
 */
export function readLocalStackApiPort(workspaceRoot: string): number | null {
  const configPath = path.join(workspaceRoot, "supabase", "config.toml");
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const section = fs
    .readFileSync(configPath, "utf8")
    .split(/^\[/m)
    .find((block) => block.startsWith("api]"));
  const match = section?.match(/^port\s*=\s*(\d+)/m);
  return match ? Number(match[1]) : null;
}

export function urlPort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

/**
 * The one mismatch that turned a test install into a write against another
 * checkout's database: `.env.local` naming a Supabase port that is not this
 * checkout's stack. Returns a sentence to show, or null when consistent.
 */
export function describeStackPortMismatch(params: {
  configPort: number | null;
  envUrl: string | undefined;
  key?: string;
}): string | null {
  const envPort = urlPort(params.envUrl);
  if (params.configPort === null || envPort === null) {
    return null;
  }
  if (envPort === params.configPort) {
    return null;
  }
  return `${params.key ?? "SUPABASE_URL"} points at port ${envPort}, but this checkout's stack (supabase/config.toml) is on ${params.configPort} — that is another checkout's database. Fix: pnpm engenty env init`;
}
