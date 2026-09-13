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
    throw new Error(readSetupApiErrorMessage(payload, fallbackMessage));
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
 * `VITE_ENGENTY_AI_BASE_URL` without a trailing slash, or the page's own
 * origin (the core gateway proxies `/ai` there). The same rule the copilot
 * client applies, so the gate probes exactly the URL the chat would use.
 */
export function resolveAiServiceBaseUrl(): string {
  const raw =
    runtimeEnvOverride("VITE_ENGENTY_AI_BASE_URL") ??
    (import.meta as ImportMeta & { env?: Record<string, string | undefined> })
      .env?.VITE_ENGENTY_AI_BASE_URL;
  const normalized = (raw ?? "").trim().replace(/\/$/, "");
  if (normalized) {
    return normalized;
  }
  return typeof window === "undefined" ? "" : window.location.origin;
}

/**
 * The row only the browser can answer. A Portless URL under plain `pnpm dev`
 * (F3 of the first test install) fails here and nowhere else: core reaches
 * apps/ai fine, the browser does not.
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
    const isPortless = /^https:\/\/[^/]*\.localhost/i.test(base);
    return {
      detail: `${url} — ${error instanceof Error ? error.message : String(error)}`,
      fix: isPortless
        ? "pnpm dev:urls:localhost && restart pnpm dev  (Portless URLs in .env.local, but the app runs on localhost — or start with pnpm dev:portless)"
        : "pnpm dev  (apps/ai must be running); check VITE_ENGENTY_AI_BASE_URL in .env.local",
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
