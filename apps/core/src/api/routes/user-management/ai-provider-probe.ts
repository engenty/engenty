/**
 * "Test key" for the first-run wizard and the Platform settings page.
 *
 * Neither gateway needs a credential to list its catalog, so the catalog says
 * nothing about a key. Each has one cheap authenticated endpoint that spends
 * no tokens: it answers 200 for a live key and 401 for a dead one.
 */
export type AiProviderGateway = "vercel" | "openrouter";

export const AI_PROVIDER_GATEWAYS: Readonly<
  Record<AiProviderGateway, { envKey: string; label: string; probeUrl: string }>
> = {
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    label: "OpenRouter",
    probeUrl: "https://openrouter.ai/api/v1/key",
  },
  vercel: {
    envKey: "AI_GATEWAY_API_KEY",
    label: "Vercel AI Gateway",
    probeUrl: "https://ai-gateway.vercel.sh/v1/credits",
  },
};

export function isAiProviderGateway(
  value: unknown
): value is AiProviderGateway {
  return value === "vercel" || value === "openrouter";
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
      headers: { authorization: `Bearer ${params.apiKey}` },
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
