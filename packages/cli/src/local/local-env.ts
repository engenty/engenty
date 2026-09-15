import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getValue,
  parseEnvDocument,
  serializeEnvDocument,
  setValue,
} from "../env-setup/env-file-document.js";
import { engentyHome, ensureEngentyHome } from "../home.js";
import type { StackCredentials } from "./supabase-stack.js";

export const DEFAULT_EDGE_PORT = 8787;

export function homeEnvPath(home = engentyHome()): string {
  return path.join(home, ".env");
}

/** Same shape the deploy wizard mints, so a managed install and a server agree. */
function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export interface LocalEnvParams {
  credentials: StackCredentials;
  /**
   * Reachable from inside the containers, TLS off. The migrate container runs
   * `supabase db push` against this, so a host-side `127.0.0.1` would point it
   * at itself.
   */
  internalDbUrl: string;
  /** Reachable from inside the containers; the browser keeps localhost. */
  internalSupabaseUrl: string;
  port: number;
  /** Host directories the compose bind-mounts, created under the install. */
  sandboxDir: string;
  spacesDir: string;
}

/**
 * Fill the values the compose file has no default for, and leave everything
 * already in the file alone — a rerun of `start` must never rotate a secret or
 * overwrite a key the operator set with `engenty env set`.
 */
export function buildHomeEnv(existing: string, params: LocalEnvParams): string {
  const doc = parseEnvDocument(existing);
  const appUrl = `http://localhost:${params.port}`;
  const wanted: Record<string, string> = {
    PUBLIC_APP_URL: appUrl,
    ENGENTY_CORS_ORIGINS: appUrl,
    SUPABASE_URL: params.internalSupabaseUrl,
    SUPABASE_ANON_KEY: params.credentials.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: params.credentials.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: params.internalDbUrl,
    SUPABASE_JWT_SECRET: params.credentials.SUPABASE_JWT_SECRET,
    // The browser talks to Supabase directly, so it needs the host address
    // rather than the one the containers use.
    VITE_SUPABASE_URL: params.credentials.SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: params.credentials.SUPABASE_ANON_KEY,
    ENGENTY_SECURITY_JWT_SECRET: generateSecret(),
    // Host paths for the two trees the containers mount. apps/ai hands
    // ENGENTY_SANDBOX_HOST_DIR to the Docker daemon when it starts a sibling
    // container, so it must be the path as the HOST sees it.
    ENGENTY_SANDBOX_HOST_DIR: params.sandboxDir,
    ENGENTY_SPACES_HOST_DIR: params.spacesDir,
    // Empty on purpose: /initial_setup collects the model provider key, and an
    // unset variable would stop compose before the app can ask for one.
    AI_GATEWAY_API_KEY: "",
  };
  for (const [key, value] of Object.entries(wanted)) {
    if (getValue(doc, key) === undefined) {
      setValue(doc, key, value);
    }
  }
  return serializeEnvDocument(doc);
}

export function writeHomeEnv(
  params: LocalEnvParams,
  home = engentyHome()
): string {
  ensureEngentyHome(home);
  for (const dir of [params.sandboxDir, params.spacesDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const file = homeEnvPath(home);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const next = buildHomeEnv(existing, params);
  fs.writeFileSync(file, next, "utf8");
  return file;
}
