/**
 * OpenTelemetry span helpers for workflow tracing.
 * When Langfuse OTel is initialized, spans created here appear as a dependency tree in Langfuse.
 * Uses the global tracer from the active SDK (e.g. NodeSDK + LangfuseSpanProcessor).
 */

const TRACER_NAME = "engenty";
const TRACER_VERSION = "1.0.0";

export type SpanAttributes = Record<
  string,
  string | number | boolean | undefined
>;

function toSpanAttributes(
  attrs?: SpanAttributes
): Record<string, string | number | boolean> | undefined {
  if (!attrs) {
    return;
  }
  const entries = Object.entries(attrs).filter(
    (entry): entry is [string, string | number | boolean] =>
      entry[1] !== undefined && entry[1] !== null
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Run an async function inside a new span. The span is ended when the function settles.
 * Use for workflow steps (e.g. "query_discovery", "agentic_definition", "template_generation")
 * so Langfuse shows a clear parent/child trace.
 */
export async function runWithSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: SpanAttributes
): Promise<T> {
  let api: typeof import("@opentelemetry/api") | null = null;
  try {
    api = await import("@opentelemetry/api");
  } catch {
    return await fn();
  }
  if (!api.trace?.getTracer) {
    return fn();
  }
  const tracer = api.trace.getTracer(TRACER_NAME, TRACER_VERSION);
  const span = tracer.startSpan(name, {
    attributes: toSpanAttributes(attributes),
  });
  const ctx = api.trace.setSpan(api.context.active(), span);
  try {
    const result = await api.context.with(ctx, fn);
    if (typeof span.setStatus === "function") {
      span.setStatus({ code: api.SpanStatusCode?.OK ?? 1 });
    }
    return result;
  } catch (err) {
    if (typeof span.setStatus === "function") {
      span.setStatus({
        code: api.SpanStatusCode?.ERROR ?? 2,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (typeof span.recordException === "function" && err instanceof Error) {
      span.recordException(err);
    }
    throw err;
  } finally {
    span.end();
  }
}
