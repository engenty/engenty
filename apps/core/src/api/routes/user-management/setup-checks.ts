import { SPACE_BASELINE_MOUNTS } from "@engenty/plugin-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The readiness gate of the first-run wizard: what `engenty setup` was
 * supposed to leave behind, as seen from the running core.
 *
 * One row per thing the browser cannot check itself. A `fail` row blocks the
 * wizard and carries the terminal command that fixes it; a `warn` row points
 * at the wizard step that resolves it and never blocks. `engenty doctor` asks
 * the same questions of the checkout; this asks them of the process.
 */
export interface SetupCheck {
  detail?: string;
  /** Terminal command for a `fail` row. */
  fix?: string;
  id:
    | "database"
    | "mastra_schema"
    | "ai_service"
    | "ai_provider"
    | "baseline_modules";
  label: string;
  status: "ok" | "fail" | "warn";
  /** Wizard step that resolves a `warn` row. */
  step?: number;
}

export interface SetupChecksDeps {
  /** Base URL of apps/ai as core reaches it, or null when unset. */
  aiBaseUrl: string | null;
  /** Service-role client; null when the database is not configured. */
  client: SupabaseClient | null;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  /** Module ids this build ships, or null when no registry is loaded. */
  installedModuleIds: readonly string[] | null;
  supabaseUrl: string | null;
}

const HTTP_TIMEOUT_MS = 3000;

/** Env vars that each hold one model gateway's credential. */
export const AI_PROVIDER_ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "OPENROUTER_API_KEY",
  "OPPER_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
] as const;

function hostOf(url: string | null): string {
  if (!url) {
    return "unset";
  }
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function checkDatabase(deps: SetupChecksDeps): Promise<SetupCheck> {
  const label = "Database reachable";
  if (!deps.client) {
    return {
      detail: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set",
      fix: "pnpm engenty env init",
      id: "database",
      label,
      status: "fail",
    };
  }
  try {
    const result = await deps.client
      .schema("core")
      .from("users")
      .select("id", { count: "exact", head: true });
    if (result.error) {
      throw result.error;
    }
    return {
      detail: `${hostOf(deps.supabaseUrl)} — core schema answers`,
      id: "database",
      label,
      status: "ok",
    };
  } catch (error) {
    return {
      detail: `${hostOf(deps.supabaseUrl)} — ${errorText(error)}`,
      fix: "pnpm engenty db up && pnpm engenty db migrate",
      id: "database",
      label,
      status: "fail",
    };
  }
}

/**
 * The tables a conversation cannot run without. apps/ai probes the same
 * fingerprint at boot (`mastra-schema-readiness.ts`); a fresh install whose
 * `engenty setup` ran the env wizard after the migrations has none of them.
 */
const MASTRA_TABLES = ["mastra_threads", "mastra_messages"] as const;

async function checkMastraSchema(deps: SetupChecksDeps): Promise<SetupCheck> {
  const label = "Mastra schema applied";
  if (!deps.client) {
    return {
      id: "mastra_schema",
      label,
      status: "fail",
      fix: "pnpm engenty db migrate",
    };
  }
  const missing: string[] = [];
  for (const table of MASTRA_TABLES) {
    try {
      const result = await deps.client
        .schema("ai")
        .from(table)
        .select("id", { count: "exact", head: true });
      if (result.error) {
        missing.push(table);
      }
    } catch {
      missing.push(table);
    }
  }
  return missing.length === 0
    ? {
        detail: "ai.mastra_* present",
        id: "mastra_schema",
        label,
        status: "ok",
      }
    : {
        detail: `missing ai.{${missing.join(", ")}}`,
        fix: "pnpm engenty db migrate",
        id: "mastra_schema",
        label,
        status: "fail",
      };
}

async function checkAiService(deps: SetupChecksDeps): Promise<SetupCheck> {
  const label = "AI service reachable from core";
  if (!deps.aiBaseUrl) {
    return {
      detail: "ENGENTY_AI_BASE_URL is not set",
      fix: "pnpm engenty env init",
      id: "ai_service",
      label,
      status: "fail",
    };
  }
  const url = `${deps.aiBaseUrl.replace(/\/+$/, "")}/ai/health`;
  // A Portless name under plain `pnpm dev` is the shape the first test
  // install hit; the URL block is what to change, not the process.
  const portless = /^https:\/\/[^/]*\.localhost/i.test(deps.aiBaseUrl);
  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { detail: url, id: "ai_service", label, status: "ok" };
  } catch (error) {
    return {
      detail: `${url} — ${errorText(error)}`,
      fix: portless
        ? "pnpm dev:urls:localhost && restart pnpm dev  (Portless URLs in .env.local, but the app runs on localhost — or start with pnpm dev:portless)"
        : "pnpm dev  (apps/ai must be running; ENGENTY_AI_BASE_URL names it)",
      id: "ai_service",
      label,
      status: "fail",
    };
  }
}

function checkAiProvider(env: Record<string, string | undefined>): SetupCheck {
  const label = "AI provider key";
  const set = AI_PROVIDER_ENV_KEYS.filter((key) => env[key]?.trim());
  return set.length > 0
    ? {
        detail: `${set.join(", ")} set`,
        id: "ai_provider",
        label,
        status: "ok",
      }
    : {
        detail:
          "No model gateway key yet — the copilot cannot answer without one",
        id: "ai_provider",
        label,
        status: "warn",
        step: 3,
      };
}

/**
 * Every space the database creates carries the baseline mounts. A build that
 * does not ship one of those modules cannot save any space's setup — the
 * symptom the first test install hit as "Couldn't open space".
 */
function checkBaselineModules(
  installed: readonly string[] | null
): SetupCheck | null {
  if (installed === null) {
    return null;
  }
  const have = new Set(installed);
  const missing = SPACE_BASELINE_MOUNTS.filter(
    (mount) => mount.resourceType === "module" && !have.has(mount.resourceKey)
  ).map((mount) => mount.resourceKey);
  const label = "Baseline modules installed";
  return missing.length === 0
    ? {
        detail: SPACE_BASELINE_MOUNTS.filter((m) => m.resourceType === "module")
          .map((m) => m.resourceKey)
          .join(", "),
        id: "baseline_modules",
        label,
        status: "ok",
      }
    : {
        detail: `every space mounts ${missing.join(", ")}, which this build does not ship`,
        fix: `pnpm engenty install ${missing.join(" ")}`,
        id: "baseline_modules",
        label,
        status: "fail",
      };
}

export async function runSetupChecks(
  deps: SetupChecksDeps
): Promise<SetupCheck[]> {
  const env = deps.env ?? process.env;
  const [database, mastra, aiService] = await Promise.all([
    checkDatabase(deps),
    checkMastraSchema(deps),
    checkAiService(deps),
  ]);
  const checks: SetupCheck[] = [database, mastra, aiService];
  const baseline = checkBaselineModules(deps.installedModuleIds);
  if (baseline) {
    checks.push(baseline);
  }
  checks.push(checkAiProvider(env));
  return checks;
}
