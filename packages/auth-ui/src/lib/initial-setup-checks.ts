/**
 * The readiness gate and the AI-provider step of the first-run wizard.
 *
 * The gate shows one list: core's rows (`GET /api/users/setup/checks` — what
 * `engenty setup` should have left behind, as the running process sees it)
 * plus the one row only the browser can answer, whether the AI service is
 * reachable at the URL the UI was built with. A `fail` row blocks and carries
 * the terminal command; a `warn` row points at the wizard step that resolves
 * it.
 */
import { runtimeEnvOverride } from "@engenty/environment";
import { getApiBaseUrl } from "./api-client";
import {
  errorIfDatabaseUnavailableFromResponse,
  readResponseJsonLoose,
  readSetupApiErrorMessage,
} from "./initial-setup-gate";

const SETUP_REQUEST_TIMEOUT_MS = 10_000;
const BROWSER_PROBE_TIMEOUT_MS = 4000;

export interface SetupCheck {
  detail?: string;
  fix?: string;
  id: string;
  label: string;
  status: "ok" | "fail" | "warn";
  step?: number;
}

export function setupBlocked(checks: readonly SetupCheck[]): boolean {
  return checks.some((check) => check.status === "fail");
}

/** Rows that need the person: failures first, then warnings. */
export function attentionCount(checks: readonly SetupCheck[]): number {
  return checks.filter((check) => check.status !== "ok").length;
}

async function setupJson<T>(
  path: string,
  init: { accessToken?: string; body?: unknown; method: string },
  fallbackMessage: string
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: init.method,
    headers: {
      ...(init.accessToken
        ? { authorization: `Bearer ${init.accessToken}` }
        : {}),
      "content-type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
  });
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(
      readSetupApiErrorMessage(
        payload,
        `${fallbackMessage} (HTTP ${response.status} — is the core API running?)`
      )
    );
  }
  const body = payload as { data?: T };
  return (body?.data ?? payload) as T;
}

/** Core's half of the gate. Empty once setup is complete (409). */
export async function readSetupChecks(): Promise<SetupCheck[]> {
  const response = await fetch(`${getApiBaseUrl()}/api/users/setup/checks`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(SETUP_REQUEST_TIMEOUT_MS),
  });
  if (response.status === 409) {
    return [];
  }
  const payload = await readResponseJsonLoose(response);
  const dbErr = errorIfDatabaseUnavailableFromResponse(response, payload);
  if (dbErr) {
    throw dbErr;
  }
  if (!response.ok) {
    throw new Error(
      readSetupApiErrorMessage(payload, "Could not read the setup checks.")
    );
  }
  const body = payload as { data?: { checks?: SetupCheck[] } };
  return body?.data?.checks ?? [];
}

/**
 * Same-origin `/ai` (Vite or the core gateway proxies it). A baked
 * `VITE_ENGENTY_AI_BASE_URL` of `https://engenty.localhost` must not be
 * probed when this page is `http://localhost:5173` — that is a different
 * origin, and the browser cannot reach it under plain `pnpm dev`.
 */
export function resolveAiServiceBaseUrl(): string {
  const pageOrigin =
    typeof window === "undefined"
      ? ""
      : window.location.origin.replace(/\/$/, "");
  if (pageOrigin) {
    return pageOrigin;
  }
  const raw =
    runtimeEnvOverride("VITE_ENGENTY_AI_BASE_URL") ??
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env?.VITE_ENGENTY_AI_BASE_URL;
  return (raw ?? "").trim().replace(/\/$/, "");
}

const PORTLESS_ORIGIN = /^https:\/\/[^/]*\.localhost/i;

function browserAiProbeFix(base: string): string {
  if (PORTLESS_ORIGIN.test(base)) {
    return "pnpm portless && pnpm dev:portless  (this page is HTTPS *.localhost — /ai is proxied there)";
  }
  return "pnpm dev  (apps/ai must be running)";
}

/**
 * The row only the browser can answer. Probes this page's origin, which is
 * the URL the copilot would use through the same-origin `/ai` proxy.
 */
export async function probeAiServiceFromBrowser(
  fetchImpl: typeof fetch = fetch
): Promise<SetupCheck> {
  const base = resolveAiServiceBaseUrl();
  const label = "AI service reachable from this browser";
  const url = `${base}/ai/health`;
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(BROWSER_PROBE_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return { detail: url, id: "ai_service_browser", label, status: "ok" };
  } catch (error) {
    return {
      detail: `${url} — ${error instanceof Error ? error.message : String(error)}`,
      fix: browserAiProbeFix(base),
      id: "ai_service_browser",
      label,
      status: "fail",
    };
  }
}

// ─── AI provider step ────────────────────────────────────────────────────────

export type AiProviderGateway =
  | "vercel"
  | "openrouter"
  | "opper"
  | "openai"
  | "anthropic";

export interface AiProviderOption {
  blurb: string;
  envKey: string;
  gateway: AiProviderGateway;
  keyUrl: string;
  label: string;
  placeholder: string;
}

/**
 * The order is the recommendation: the two gateways that serve every kind of
 * model first, then the direct vendors, whose keys cover chat only (search
 * indexing and voice still go through the Vercel gateway).
 */
export const AI_PROVIDER_OPTIONS: readonly AiProviderOption[] = [
  {
    blurb:
      "Chat, embeddings, images and transcription. The default: one key for every model.",
    envKey: "AI_GATEWAY_API_KEY",
    gateway: "vercel",
    keyUrl: "https://vercel.com/d?to=/[team]/~/ai/api-keys",
    label: "Vercel AI Gateway",
    placeholder: "vck_…",
  },
  {
    blurb: "Chat models only; search and voice still need the Vercel gateway.",
    envKey: "OPENROUTER_API_KEY",
    gateway: "openrouter",
    keyUrl: "https://openrouter.ai/settings/keys",
    label: "OpenRouter",
    placeholder: "sk-or-…",
  },
  {
    blurb:
      "EU-hosted gateway, chat models only; the catalog appears once the key is saved.",
    envKey: "OPPER_API_KEY",
    gateway: "opper",
    keyUrl: "https://platform.opper.ai",
    label: "Opper",
    placeholder: "op-…",
  },
  {
    blurb: "Direct: OpenAI chat models on your own OpenAI account.",
    envKey: "OPENAI_API_KEY",
    gateway: "openai",
    keyUrl: "https://platform.openai.com/api-keys",
    label: "OpenAI",
    placeholder: "sk-…",
  },
  {
    blurb: "Direct: Claude models on your own Anthropic account.",
    envKey: "ANTHROPIC_API_KEY",
    gateway: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    label: "Anthropic",
    placeholder: "sk-ant-…",
  },
];

export interface AiProviderTestResult {
  detail: string;
  modelCount: number | null;
  status: "valid" | "invalid" | "unverified";
}

export async function testAiProviderKey(params: {
  accessToken: string;
  apiKey: string;
  gateway: AiProviderGateway;
}): Promise<AiProviderTestResult> {
  return await setupJson<AiProviderTestResult>(
    "/api/users/setup/ai-provider/test",
    {
      accessToken: params.accessToken,
      body: { apiKey: params.apiKey, gateway: params.gateway },
      method: "POST",
    },
    "Could not test the key."
  );
}

export interface AiProviderSaveResult {
  /** What core did after the write: applied here and in apps/ai, or not. */
  reload:
    | { hydrated: string[]; status: "reloaded" }
    | { detail: string; status: "unreachable" }
    | { status: "skipped" };
}

/**
 * Env var names the gate already saw as set (`"AI_GATEWAY_API_KEY set"`).
 * Empty when the provider row is missing or still a warning.
 */
export function aiProviderEnvKeysFromChecks(
  checks: readonly SetupCheck[]
): string[] {
  const check = checks.find(
    (row) => row.id === "ai_provider" && row.status === "ok"
  );
  if (!check?.detail) {
    return [];
  }
  const known = new Set(AI_PROVIDER_OPTIONS.map((option) => option.envKey));
  return check.detail
    .replace(/\s+set$/i, "")
    .split(",")
    .map((part) => part.trim())
    .filter((key) => known.has(key));
}

export function aiProviderLabelFromEnvKeys(keys: readonly string[]): string {
  const labels = AI_PROVIDER_OPTIONS.filter((option) =>
    keys.includes(option.envKey)
  ).map((option) => option.label);
  return labels.length > 0 ? labels.join(", ") : "Server environment";
}

export type AiProviderStepDecision =
  | { kind: "connected-env"; label: string }
  | { kind: "need-key" }
  | { kind: "save"; apiKey: string }
  | { kind: "skipped" };

/**
 * Step 3: a pasted key is saved as a platform setting. An empty Continue or
 * Skip keeps the server env key when the gate already saw one — it does not
 * mean "the copilot stays off".
 */
export function decideAiProviderStep(params: {
  envKeys: readonly string[];
  intent: "continue" | "skip";
  pastedKey: string;
}): AiProviderStepDecision {
  const pasted = params.pastedKey.trim();
  if (params.intent === "skip") {
    return params.envKeys.length > 0
      ? {
          kind: "connected-env",
          label: aiProviderLabelFromEnvKeys(params.envKeys),
        }
      : { kind: "skipped" };
  }
  if (pasted) {
    return { kind: "save", apiKey: pasted };
  }
  if (params.envKeys.length > 0) {
    return {
      kind: "connected-env",
      label: aiProviderLabelFromEnvKeys(params.envKeys),
    };
  }
  return { kind: "need-key" };
}

/**
 * Stored as a platform setting. Core applies it to its own environment and
 * tells apps/ai to re-read, so the first chat after this step has a key.
 */
export async function saveAiProviderKey(params: {
  accessToken: string;
  apiKey: string;
  envKey: string;
}): Promise<AiProviderSaveResult> {
  const result = await setupJson<{ reload?: AiProviderSaveResult["reload"] }>(
    `/api/platform-settings/${encodeURIComponent(params.envKey)}`,
    {
      accessToken: params.accessToken,
      body: { value: params.apiKey },
      method: "PATCH",
    },
    "Could not save the key."
  );
  return { reload: result.reload ?? { status: "skipped" } };
}
