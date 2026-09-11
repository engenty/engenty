// Agent-run tracing — Mastra's own observability, fed by whichever sinks the
// installation configured. Off entirely when none is: Mastra keeps its no-op
// and no span is ever built.
//
// Every sink is a Mastra `ObservabilityExporter`; engenty owns only the
// mapping from platform settings to exporters. The keys below are declared in
// `modules/engenty-copilot/engenty.plugin.json` (Setup → Platform shows them)
// and hydrated into process.env before this module is evaluated — see
// `src/platform-settings-hydrate.ts`.
//
// Two other instruments are NOT sinks and stay where they are: the wire-level
// LLM trace (`withLlmTrace`, `ENGENTY_LLM_TRACE`) sees the request exactly as
// the provider receives it, which no exporter does; usage metering
// (`recordAiUsage`) is billing data with its own schema.
import { envIsTruthy } from "@engenty/telemetry";
import { SpanType } from "@mastra/core/observability";
import { LangfuseExporter } from "@mastra/langfuse";
import {
  MastraStorageExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";
import { TRACE_CONTEXT_KEYS } from "../src/ai/trace-context.js";

/** Env keys the sinks read — the hydration list for apps/ai boot. */
export const OBSERVABILITY_SETTING_KEYS = [
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_BASE_URL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "ENGENTY_TRACE_STORE",
] as const;

/** `key=value,key=value` — the OTel spec's own header encoding. */
function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of (raw ?? "").split(",")) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (key && value) {
      headers[key] = value;
    }
  }
  return headers;
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function createEngentyObservability(
  env: NodeJS.ProcessEnv = process.env
): Observability | undefined {
  const exporters = [];

  const langfuseSecret = trimmed(env.LANGFUSE_SECRET_KEY);
  if (langfuseSecret) {
    exporters.push(
      new LangfuseExporter({
        secretKey: langfuseSecret,
        publicKey: trimmed(env.LANGFUSE_PUBLIC_KEY),
        baseUrl: trimmed(env.LANGFUSE_BASE_URL),
        environment: trimmed(env.NODE_ENV),
      })
    );
  }

  const otlpEndpoint = trimmed(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (otlpEndpoint) {
    exporters.push(
      new OtelExporter({
        provider: {
          custom: {
            endpoint: otlpEndpoint,
            headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
            protocol: "http/protobuf",
          },
        },
        // Spans only. Logs already leave this process through evlog.
        signals: { logs: false, traces: true },
      })
    );
  }

  // The built-in sink: spans into the Mastra store (`ai.mastra_ai_spans`),
  // where Mastra Studio's Traces view reads them. Off by default until a
  // retention sweep exists — it grows per run.
  if (envIsTruthy("ENGENTY_TRACE_STORE")) {
    exporters.push(new MastraStorageExporter());
  }

  if (exporters.length === 0) {
    return;
  }

  return new Observability({
    configs: {
      default: {
        serviceName: "engenty-ai",
        exporters,
        // Per-token chunks are volume without information; Langfuse bills
        // per span.
        excludeSpanTypes: [SpanType.MODEL_CHUNK],
        // Redacts by key name (token, secret, password, …). Prompts and
        // completions are exported verbatim — that is what a tracing sink is
        // for, and setting a key is the platform admin's decision to send them.
        spanOutputProcessors: [new SensitiveDataFilter()],
        requestContextKeys: [...TRACE_CONTEXT_KEYS],
      },
    },
  });
}
