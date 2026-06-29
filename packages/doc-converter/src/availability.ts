import { env } from "@engenty/telemetry";

/**
 * Whether cloud doc-converter backends are configured (env keys present).
 * Does not perform network checks.
 */
export function getDocConverterCloudAvailability(): {
  llamaparse: boolean;
  gemini: boolean;
} {
  return {
    llamaparse: !!env("LLAMA_CLOUD_API_KEY")?.trim(),
    gemini: !!env("AI_GATEWAY_API_KEY")?.trim(),
  };
}
