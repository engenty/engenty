/**
 * OpenTelemetry + Langfuse bootstrap for Vercel AI SDK observability.
 * Call once at application startup (e.g. from api-entry before startApiServer).
 * No-op when LANGFUSE_SECRET_KEY is not set.
 */

import { env, envIsDefined } from "./process-env.js";

let initialized = false;

/**
 * Initialize OpenTelemetry with Langfuse span processor when Langfuse is configured.
 * Reads LANGFUSE_SECRET_KEY, LANGFUSE_PUBLIC_KEY, LANGFUSE_BASE_URL from process.env.
 * Idempotent: subsequent calls are no-ops.
 */
export async function initLangfuseOtel(): Promise<void> {
  if (initialized) {
    return;
  }
  const secretKey = env("LANGFUSE_SECRET_KEY");
  if (!secretKey) {
    return;
  }
  const publicKey = env("LANGFUSE_PUBLIC_KEY");
  const baseUrl = env("LANGFUSE_BASE_URL");

  const [{ NodeSDK }, { LangfuseSpanProcessor }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@langfuse/otel"),
  ]);

  const processor = new LangfuseSpanProcessor({
    publicKey: publicKey || undefined,
    secretKey,
    baseUrl: baseUrl || undefined,
  });
  const sdk = new NodeSDK({
    spanProcessors: [processor],
  });
  sdk.start();
  initialized = true;
}

/**
 * Synchronous check: whether Langfuse OTel is configured (LANGFUSE_SECRET_KEY set).
 * Use to decide whether to pass telemetry to AI SDK calls.
 */
export function isLangfuseOtelConfigured(): boolean {
  return envIsDefined("LANGFUSE_SECRET_KEY");
}
