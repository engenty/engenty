import {
  type ResolvedTranscriptToolDisplay,
  resolveTranscriptToolDisplay,
} from "./resolve-transcript-tool-display.js";

export interface NormalizeDynamicToolDisplayInput {
  input?: unknown;
  output?: unknown;
  toolName: string;
}

export type NormalizedDynamicToolDisplay = ResolvedTranscriptToolDisplay;

export function normalizeDynamicToolDisplay(
  params: NormalizeDynamicToolDisplayInput
): NormalizedDynamicToolDisplay {
  return resolveTranscriptToolDisplay(params);
}

export function attachDynamicToolDisplay<T extends Record<string, unknown>>(
  part: T,
  wireToolName: string
): T & NormalizedDynamicToolDisplay {
  const normalized = normalizeDynamicToolDisplay({
    toolName: wireToolName,
    input: part.input,
    output: part.output,
  });
  return {
    ...part,
    displayLabel: normalized.displayLabel,
    resolvedToolName: normalized.resolvedToolName,
    ...(normalized.metadata ? { metadata: normalized.metadata } : {}),
  };
}
