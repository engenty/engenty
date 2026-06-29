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
 * App-level coordinator model id from config or env. Prefers config.aiCoordinatorModel
 * (when a string), then process.env.AI_COORDINATOR_MODEL. Returns trimmed string or "".
 */
export function getAppCoordinatorModel(
  config: Record<string, unknown>
): string {
  const fromConfig =
    typeof config.aiCoordinatorModel === "string"
      ? config.aiCoordinatorModel.trim()
      : "";
  const fromEnv = env("AI_COORDINATOR_MODEL") ?? "";
  return fromConfig || fromEnv;
}
