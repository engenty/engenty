/**
 * Wire-level LLM call tracing: one JSON file per model call.
 *
 * Off unless `ENGENTY_LLM_TRACE` is set. `1`/`true` write under
 * `<cwd>/.llm-trace`; any other value is the trace directory — set an absolute
 * path to collect calls from every host in one place. Trace files hold tenant
 * conversation data and must never be committed.
 *
 * The file is written twice: the request alone before the provider call, then
 * request + response when the call settles. A call that dies mid-flight
 * (window saturation, timeout, kill) still leaves its exact input on disk.
 *
 * The `summary` block exists so a fat prompt can be read without tokenizing:
 * bytes per prompt message and per tool schema, sorted by the JSON weight the
 * model actually receives.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@engenty/telemetry";
import { type LanguageModel, wrapLanguageModel } from "ai";

const logger = createLogger({ name: "ai-core/llm-trace" });

function traceDir(): string | null {
  const value = process.env.ENGENTY_LLM_TRACE?.trim();
  if (!value || value === "0" || value.toLowerCase() === "false") {
    return null;
  }
  if (value === "1" || value.toLowerCase() === "true") {
    return join(process.cwd(), ".llm-trace");
  }
  return value;
}

let sequence = 0;

function traceFilePath(dir: string, modelId: string): string {
  sequence += 1;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const model = modelId.replace(/[^\w.-]+/g, "_");
  const seq = String(sequence).padStart(4, "0");
  return join(dir, `${stamp}_pid${process.pid}_${seq}_${model}.json`);
}

/** Byte payloads stay out of the trace; their size is what matters. */
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return `<${value.byteLength} bytes>`;
  }
  if (value instanceof ArrayBuffer) {
    return `<${value.byteLength} bytes>`;
  }
  if (value instanceof URL) {
    return value.toString();
  }
  return value;
}

function jsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value, replacer)?.length ?? 0;
  } catch {
    return -1;
  }
}

interface PromptMessageLike {
  content?: unknown;
  role?: string;
}

interface ToolLike {
  name?: string;
}

function summarize(params: unknown): Record<string, unknown> {
  const { prompt, tools } = (params ?? {}) as {
    prompt?: PromptMessageLike[];
    tools?: ToolLike[];
  };
  const messages = Array.isArray(prompt) ? prompt : [];
  const toolList = Array.isArray(tools) ? tools : [];

  const perMessage = messages.map((message, index) => ({
    bytes: jsonBytes(message),
    index,
    role: message.role ?? "?",
  }));
  const perTool = toolList
    .map((tool) => ({ bytes: jsonBytes(tool), name: tool.name ?? "?" }))
    .sort((a, b) => b.bytes - a.bytes);

  return {
    messageBytes: perMessage.reduce((sum, entry) => sum + entry.bytes, 0),
    messages: perMessage,
    systemBytes: perMessage
      .filter((entry) => entry.role === "system")
      .reduce((sum, entry) => sum + entry.bytes, 0),
    toolBytes: perTool.reduce((sum, entry) => sum + entry.bytes, 0),
    toolCount: perTool.length,
    tools: perTool,
    totalRequestBytes: jsonBytes(params),
  };
}

function writeTrace(file: string, record: unknown): void {
  try {
    writeFileSync(file, JSON.stringify(record, replacer, 2));
  } catch (error) {
    // Tracing must never take a run down with it.
    logger.warn("failed to write trace file", { error, file });
  }
}

interface StreamPartLike {
  delta?: unknown;
  finishReason?: unknown;
  id?: string;
  type?: string;
  usage?: unknown;
}

/**
 * Collapse a finished stream into what the model said: deltas concatenated per
 * `type:id` channel, every non-delta part kept verbatim, finish metadata
 * lifted to the top.
 */
function assembleStream(parts: StreamPartLike[]): Record<string, unknown> {
  const deltas = new Map<string, string>();
  const rest: StreamPartLike[] = [];
  let finishReason: unknown;
  let usage: unknown;
  const partCounts: Record<string, number> = {};

  for (const part of parts) {
    const type = part.type ?? "?";
    partCounts[type] = (partCounts[type] ?? 0) + 1;
    if (type.endsWith("-delta") && typeof part.delta === "string") {
      const channel = `${type.slice(0, -"-delta".length)}:${part.id ?? ""}`;
      deltas.set(channel, (deltas.get(channel) ?? "") + part.delta);
      continue;
    }
    if (type === "finish") {
      finishReason = part.finishReason;
      usage = part.usage;
    }
    rest.push(part);
  }

  return {
    finishReason,
    partCounts,
    parts: rest,
    text: Object.fromEntries(deltas),
    usage,
  };
}

function startTrace(
  dir: string,
  model: { modelId: string; provider: string },
  params: unknown
): { finish: (response: Record<string, unknown>) => void } {
  const file = traceFilePath(dir, model.modelId);
  const startedAt = new Date().toISOString();
  const base = {
    meta: {
      modelId: model.modelId,
      pid: process.pid,
      provider: model.provider,
      startedAt,
    },
    request: params,
    summary: summarize(params),
  };
  writeTrace(file, base);
  const startedMs = Date.now();
  return {
    finish: (response) => {
      writeTrace(file, {
        ...base,
        response: {
          durationMs: Date.now() - startedMs,
          finishedAt: new Date().toISOString(),
          ...response,
        },
      });
    },
  };
}

/**
 * Wrap a chat model so every `doGenerate` / `doStream` lands on disk. Returns
 * the model untouched when tracing is off — the check runs per wrap, and
 * models are constructed per call, so flipping the env only needs new calls,
 * not a restart.
 */
export function withLlmTrace(model: LanguageModel): LanguageModel {
  const dir = traceDir();
  if (!dir || typeof model === "string") {
    return model;
  }
  try {
    mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.warn("cannot create trace directory", { dir, error });
    return model;
  }

  return wrapLanguageModel({
    middleware: {
      wrapGenerate: async ({ doGenerate, model: inner, params }) => {
        const trace = startTrace(dir, inner, params);
        try {
          const result = await doGenerate();
          trace.finish({ result });
          return result;
        } catch (error) {
          trace.finish({ error: String(error) });
          throw error;
        }
      },
      wrapStream: async ({ doStream, model: inner, params }) => {
        const trace = startTrace(dir, inner, params);
        let result;
        try {
          result = await doStream();
        } catch (error) {
          trace.finish({ error: String(error) });
          throw error;
        }
        const parts: StreamPartLike[] = [];
        const tap = new TransformStream({
          flush: () => {
            trace.finish(assembleStream(parts));
          },
          transform: (part, controller) => {
            parts.push(part as StreamPartLike);
            controller.enqueue(part);
          },
        });
        return { ...result, stream: result.stream.pipeThrough(tap) };
      },
    },
    model,
  });
}
