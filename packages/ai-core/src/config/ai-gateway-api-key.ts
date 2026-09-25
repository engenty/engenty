import { env } from "@engenty/telemetry";
import {
  ANTHROPIC_GATEWAY_ID,
  DEFAULT_MODEL_GATEWAY_ID,
  MISTRAL_GATEWAY_ID,
  OPENAI_GATEWAY_ID,
  OPENROUTER_GATEWAY_ID,
  OPPER_GATEWAY_ID,
  SPACEXAI_GATEWAY_ID,
} from "./model-ref.js";

const AI_GATEWAY_API_KEY_ENV = "AI_GATEWAY_API_KEY";
const OPENROUTER_API_KEY_ENV = "OPENROUTER_API_KEY";
const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";
const ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY";
const OPPER_API_KEY_ENV = "OPPER_API_KEY";
// Shared with document OCR and realtime voice, which read it directly.
const MISTRAL_API_KEY_ENV = "MISTRAL_API_KEY";
const XAI_API_KEY_ENV = "XAI_API_KEY";

/**
 * Which env var holds each gateway's credential.
 *
 * One var per gateway rather than a single key plus a provider switch: an
 * install that moves a few roles to OpenRouter keeps every other role on Vercel,
 * so both credentials have to be present at once. A switch would have made the
 * two mutually exclusive.
 */
const GATEWAY_API_KEY_ENV: Readonly<Record<string, string>> = {
  [DEFAULT_MODEL_GATEWAY_ID]: AI_GATEWAY_API_KEY_ENV,
  [OPENROUTER_GATEWAY_ID]: OPENROUTER_API_KEY_ENV,
  // `OPENAI_API_KEY` predates the gateway: realtime voice reads it directly.
  // Listing it here is what makes a voice-only key also serve chat models.
  [OPENAI_GATEWAY_ID]: OPENAI_API_KEY_ENV,
  [ANTHROPIC_GATEWAY_ID]: ANTHROPIC_API_KEY_ENV,
  [OPPER_GATEWAY_ID]: OPPER_API_KEY_ENV,
  [MISTRAL_GATEWAY_ID]: MISTRAL_API_KEY_ENV,
  [SPACEXAI_GATEWAY_ID]: XAI_API_KEY_ENV,
};

function read(envKey: string): string | null {
  const key = env(envKey, "");
  return key.length > 0 ? key : null;
}

/** The env var name a gateway's credential is read from, or null if unknown. */
export function gatewayApiKeyEnvName(gateway: string): string | null {
  return GATEWAY_API_KEY_ENV[gateway.trim().toLowerCase()] ?? null;
}

/**
 * Reads `AI_GATEWAY_API_KEY` from the process environment (trimmed).
 * The Vercel AI SDK uses this env var for gateway string models; there is no
 * separate per-request key path unless a provider is constructed with an explicit apiKey.
 */
export function readAiGatewayApiKeyFromEnv(): string | null {
  return read(AI_GATEWAY_API_KEY_ENV);
}

/**
 * Reads `OPENROUTER_API_KEY`. Unlike the Vercel key this is never picked up
 * implicitly — the OpenRouter provider is always constructed with it explicitly.
 */
export function readOpenRouterApiKeyFromEnv(): string | null {
  return read(OPENROUTER_API_KEY_ENV);
}

/** The credential for one gateway, or null when it is not configured. */
export function readGatewayApiKeyFromEnv(gateway: string): string | null {
  const envKey = gatewayApiKeyEnvName(gateway);
  return envKey ? read(envKey) : null;
}

/**
 * Gateways that currently hold a credential.
 *
 * The ~20 "is AI configured at all?" gates across the product ask about the
 * Vercel key specifically; this answers the broader question a multi-gateway
 * install actually has, which is whether ANY model can be reached.
 */
export function configuredModelGateways(): string[] {
  return Object.keys(GATEWAY_API_KEY_ENV).filter(
    (gateway) => readGatewayApiKeyFromEnv(gateway) !== null
  );
}

/** True when at least one gateway can serve a model. */
export function hasAnyModelGatewayApiKey(): boolean {
  return configuredModelGateways().length > 0;
}
