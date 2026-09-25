/**
 * "Test key" for the first-run wizard and the Platform settings page.
 *
 * Each gateway has one cheap authenticated endpoint that spends no tokens: it
 * answers 200 for a live key and 401 for a dead one. For the two hosted
 * gateways that is an account endpoint (their catalogs are public and would
 * say nothing about a key); for the direct vendors and Opper it is the model
 * list itself, which is keyed.
 */
export type AiProviderGateway =
  | "vercel"
  | "openrouter"
  | "opper"
  | "openai"
  | "anthropic"
  | "mistral"
  | "spacexai"
  | "typesafe";

export interface AiProviderGatewaySpec {
  envKey: string;
  headers: (apiKey: string) => Record<string, string>;
  label: string;
  probeUrl: string;
}

const bearer = (apiKey: string): Record<string, string> => ({
  authorization: `Bearer ${apiKey}`,
});

export const AI_PROVIDER_GATEWAYS: Readonly<
  Record<AiProviderGateway, AiProviderGatewaySpec>
> = {
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    headers: (apiKey) => ({
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    }),
    label: "Anthropic",
    probeUrl: "https://api.anthropic.com/v1/models?limit=1",
  },
  mistral: {
    envKey: "MISTRAL_API_KEY",
    headers: bearer,
    label: "Mistral",
    probeUrl: "https://api.mistral.ai/v1/models",
  },
  openai: {
    envKey: "OPENAI_API_KEY",
    headers: bearer,
    label: "OpenAI",
    probeUrl: "https://api.openai.com/v1/models",
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    headers: bearer,
    label: "OpenRouter",
    probeUrl: "https://openrouter.ai/api/v1/key",
  },
  opper: {
    envKey: "OPPER_API_KEY",
    headers: bearer,
    label: "Opper",
    probeUrl: "https://api.opper.ai/v3/compat/models",
  },
  spacexai: {
    envKey: "XAI_API_KEY",
    headers: bearer,
    label: "SpaceX AI (Grok)",
    probeUrl: "https://api.x.ai/v1/models",
  },
  // Not a model gateway: the classifier behind the experimental browser fast
  // loop (PLAN-browser-fast-loop.md). Listed so the Setup UI's "Test key"
  // works for it; `ai.model` holds no rows for it.
  typesafe: {
    envKey: "TYPESAFE_API_KEY",
    headers: bearer,
    label: "TypeSafe (Jev)",
    probeUrl: "https://api.typesafe.ai/v1/models",
  },
  vercel: {
    envKey: "AI_GATEWAY_API_KEY",
    headers: bearer,
    label: "Vercel AI Gateway",
    probeUrl: "https://ai-gateway.vercel.sh/v1/credits",
  },
};

export function isAiProviderGateway(
  value: unknown
): value is AiProviderGateway {
  return typeof value === "string" && value in AI_PROVIDER_GATEWAYS;
}

/**
 * The key to probe: the one in the request, else the stored one. Platform
 * settings are applied to core's `process.env`, so that is the effective value
 * apps/ai uses too. Empty string when neither exists.
 */
export function resolveProbeApiKey(
  provided: unknown,
  gateway: AiProviderGateway,
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const fromBody = typeof provided === "string" ? provided.trim() : "";
  return fromBody || (env[AI_PROVIDER_GATEWAYS[gateway].envKey] ?? "").trim();
}

/**
 * A key reduced to what an admin needs to recognise it: its first and last
 * four characters. Short keys show only the ending so the mask never reveals
 * most of the secret.
 */
export function maskApiKey(apiKey: string): string {
  const key = apiKey.trim();
  if (key.length <= 12) {
    return `••••${key.slice(-2)}`;
  }
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

export interface AiProviderProbeResult {
  detail: string;
  /** `unverified` = the gateway did not give a yes or no (network, 5xx). */
  status: "valid" | "invalid" | "unverified";
}

const PROBE_TIMEOUT_MS = 8000;

export async function probeAiProviderKey(params: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  gateway: AiProviderGateway;
}): Promise<AiProviderProbeResult> {
  const gateway = AI_PROVIDER_GATEWAYS[params.gateway];
  try {
    const response = await (params.fetchImpl ?? fetch)(gateway.probeUrl, {
      headers: gateway.headers(params.apiKey),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      return { detail: `${gateway.label} accepted the key`, status: "valid" };
    }
    if (response.status === 401 || response.status === 403) {
      return {
        detail: `${gateway.label} rejected the key (HTTP ${response.status})`,
        status: "invalid",
      };
    }
    return {
      detail: `${gateway.label} answered HTTP ${response.status}; the key could not be verified`,
      status: "unverified",
    };
  } catch (error) {
    return {
      detail: `${gateway.label} not reachable from the server: ${
        error instanceof Error ? error.message : String(error)
      }`,
      status: "unverified",
    };
  }
}
