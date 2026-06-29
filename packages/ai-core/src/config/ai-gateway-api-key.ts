import { env } from "@engenty/telemetry";

const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";

/**
 * Reads `AI_GATEWAY_API_KEY` from the process environment (trimmed).
 * The Vercel AI SDK uses this env var for gateway string models; there is no
 * separate per-request key path unless a provider is constructed with an explicit apiKey.
 */
export function readAiGatewayApiKeyFromEnv(): string | null {
  const key = env(AI_GATEWAY_API_KEY_ENV, "");
  return key.length > 0 ? key : null;
}
