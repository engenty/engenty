import type { AGUIEvent } from "@ag-ui/core";
import type { TrajectoryRow } from "./trajectory.js";

export interface RunTokenUsageEntry {
  cachedTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
}

export interface RunLlmCall {
  cachedTokens: number | null;
  index: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  text: string;
  toolNames: string[];
}

export interface RunTraceStats {
  llmCalls: number;
  toolCalls: number;
  turns: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.floor(value)
    : null;
}

function toolNameFromRow(row: TrajectoryRow): string {
  const fromDetail = row.detail.split(/[\s\n]/)[0]?.trim();
  if (fromDetail) {
    return fromDetail;
  }
  return row.text.split(/\s/)[0]?.trim() || "tool";
}

/**
 * `@ag-ui/mastra` puts one `TokenUsage` entry per model call on
 * `RUN_FINISHED.usage`. The field is not in the AG-UI 0.0.58 schema, so it
 * only survives because we persist the event payload as-is.
 */
export function readRunFinishedUsage(
  events: readonly AGUIEvent[]
): RunTokenUsageEntry[] {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i] as Record<string, unknown>;
    if (event.type !== "RUN_FINISHED") {
      continue;
    }
    const raw = event.usage;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }
      const inputTokens =
        readCount(entry.inputTokens) ?? readCount(entry.input_tokens);
      const outputTokens =
        readCount(entry.outputTokens) ?? readCount(entry.output_tokens);
      const cachedTokens =
        readCount(entry.cachedInputTokens) ??
        readCount(entry.cached_tokens) ??
        readCount(entry.cached);
      const reasoningTokens =
        readCount(entry.reasoningTokens) ??
        readCount(entry.reasoning_tokens) ??
        readCount(entry.reasoning);
      if (
        inputTokens == null &&
        outputTokens == null &&
        cachedTokens == null &&
        reasoningTokens == null
      ) {
        return [];
      }
      return [
        {
          cachedTokens,
          inputTokens,
          outputTokens,
          reasoningTokens,
        },
      ];
    });
  }
  return [];
}

export function runTraceStats(rows: readonly TrajectoryRow[]): RunTraceStats {
  return {
    llmCalls: rows.filter((row) => row.kind === "assistant").length,
    toolCalls: rows.filter((row) => row.kind === "tool").length,
    turns: rows.reduce(
      (max, row) => (row.turn != null && row.turn > max ? row.turn : max),
      0
    ),
  };
}

/**
 * One row per model generation in the trajectory, plus tools that ran before
 * the next generation. Token counts come from `RUN_FINISHED.usage` when the
 * stream reported per-call entries; otherwise they stay null.
 */
export function buildRunLlmCalls(
  rows: readonly TrajectoryRow[],
  usage: readonly RunTokenUsageEntry[] = []
): RunLlmCall[] {
  const fromTrace: Array<{ text: string; toolNames: string[] }> = [];
  let current: { text: string; toolNames: string[] } | null = null;
  for (const row of rows) {
    if (row.kind === "assistant") {
      if (current && current.text === "") {
        current.text = row.text;
      } else {
        current = { text: row.text, toolNames: [] };
        fromTrace.push(current);
      }
      continue;
    }
    if (row.kind === "tool") {
      if (!current) {
        current = { text: "", toolNames: [] };
        fromTrace.push(current);
      }
      current.toolNames.push(toolNameFromRow(row));
    }
  }
  const count = Math.max(fromTrace.length, usage.length);
  const calls: RunLlmCall[] = [];
  for (let i = 0; i < count; i += 1) {
    const trace = fromTrace[i];
    const tokens = usage[i];
    if (!(trace || tokens)) {
      continue;
    }
    calls.push({
      cachedTokens: tokens?.cachedTokens ?? null,
      index: i + 1,
      inputTokens: tokens?.inputTokens ?? null,
      outputTokens: tokens?.outputTokens ?? null,
      reasoningTokens: tokens?.reasoningTokens ?? null,
      text: trace?.text ?? "",
      toolNames: trace?.toolNames ?? [],
    });
  }
  return calls;
}
