import {
  DEFAULT_AI_CHAT_MODEL_ID,
  readAiGatewayApiKeyFromEnv,
} from "@engenty/ai-core";
import { env } from "@engenty/telemetry";

export const AI_GATEWAY_DEFAULT_MODEL = DEFAULT_AI_CHAT_MODEL_ID;

/**
 * Returns the AI Gateway API key from `AI_GATEWAY_API_KEY` (trimmed), or null.
 * Matches how the AI SDK resolves gateway auth for string model ids.
 */
export function getAiGatewayApiKey(): string | null {
  return readAiGatewayApiKeyFromEnv();
}

/** Default model id when no app/tenant override. */
export function getAiGatewayDefaultModel(): string {
  return DEFAULT_AI_CHAT_MODEL_ID;
}

/**
 * App-level chat model id from config or env. Prefers config.aiChatModel (when a
 * string), then process.env.AI_CHAT_MODEL. Returns trimmed string or "".
 */
export function getAppChatModel(config: Record<string, unknown>): string {
  const fromConfig =
    typeof config.aiChatModel === "string" ? config.aiChatModel.trim() : "";
  const fromEnv = env("AI_CHAT_MODEL") ?? "";
  return fromConfig || fromEnv;
}

/**
 * App-level routing model id from config or env. Prefers `config.aiRoutingModel`,
 * then legacy `config.aiCoordinatorModel`, then `AI_ROUTING_MODEL`, then
 * `AI_COORDINATOR_MODEL`. Returns trimmed string or "".
 */
export function getAppRoutingModel(config: Record<string, unknown>): string {
  const fromRoutingConfig =
    typeof config.aiRoutingModel === "string"
      ? config.aiRoutingModel.trim()
      : "";
  const fromCoordinatorConfig =
    typeof config.aiCoordinatorModel === "string"
      ? config.aiCoordinatorModel.trim()
      : "";
  const fromRoutingEnv = env("AI_ROUTING_MODEL") ?? "";
  const fromCoordinatorEnv = env("AI_COORDINATOR_MODEL") ?? "";
  return (
    fromRoutingConfig ||
    fromCoordinatorConfig ||
    fromRoutingEnv ||
    fromCoordinatorEnv
  );
}

/** @deprecated Use {@link getAppRoutingModel}. */
export function getAppCoordinatorModel(
  config: Record<string, unknown>
): string {
  return getAppRoutingModel(config);
}
