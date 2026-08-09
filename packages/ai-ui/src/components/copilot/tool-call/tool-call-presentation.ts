"use client";

import type { ToolCallState } from "./tool-call-card.types";
import {
  asRecord,
  readStringField,
  toHumanValue,
  unwrapEngentyToolExecuteOutput,
} from "./tool-call-card-utils";

export interface ToolCallDetailField {
  label: string;
  mono?: boolean;
  value: string;
}

export interface ToolCallDetailSections {
  errorMessage?: string;
  fields: ToolCallDetailField[];
  outputText?: string;
}

const INPUT_FIELD_KEYS: Array<{ key: string; label: string; mono?: boolean }> =
  [
    { key: "path", label: "Path", mono: true },
    { key: "file", label: "File", mono: true },
    { key: "file_path", label: "Path", mono: true },
    { key: "filePath", label: "Path", mono: true },
    { key: "command", label: "Command", mono: true },
    { key: "cmd", label: "Command", mono: true },
    { key: "cwd", label: "Working dir", mono: true },
    { key: "query", label: "Query" },
    { key: "pattern", label: "Pattern", mono: true },
    { key: "search", label: "Search" },
    { key: "glob", label: "Glob", mono: true },
    { key: "url", label: "URL", mono: true },
    { key: "name", label: "Name" },
    { key: "title", label: "Title" },
  ];

const OUTPUT_TEXT_KEYS = [
  "stdout",
  "stderr",
  "content",
  "text",
  "message",
  "output",
  "result",
  "body",
] as const;

const MAX_OUTPUT_CHARS = 8000;
const MAX_FIELD_CHARS = 240;
const MAX_COMMAND_METADATA = 96;

function clamp(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}…`;
}

// Lives in tool-call-card-utils (the lower-level module) so the brief/prose
// helpers there can use it without importing this file back — re-exported here
// because this is where callers and tests already look for it.
export { basenamePath } from "./tool-call-card-utils";

export function formatLineRange(
  input: Record<string, unknown> | null
): string | null {
  if (!input) {
    return null;
  }
  const readScalar = (keys: string[]) => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  };
  const start = readScalar([
    "startLine",
    "start_line",
    "fromLine",
    "from_line",
  ]);
  const end = readScalar(["endLine", "end_line", "toLine", "to_line"]);
  if (start && end) {
    return `L${start}-${end}`;
  }
  if (start) {
    return `L${start}`;
  }
  return null;
}

export function truncateCommandPreview(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return "";
  }
  const oneLine = trimmed.replace(/\s+/g, " ");
  return clamp(oneLine, MAX_COMMAND_METADATA);
}

function collectInputFields(input: unknown): ToolCallDetailField[] {
  const record = asRecord(input);
  if (!record) {
    return [];
  }
  const fields: ToolCallDetailField[] = [];
  const seen = new Set<string>();

  for (const spec of INPUT_FIELD_KEYS) {
    const value = toHumanValue(record[spec.key]);
    if (!value || seen.has(spec.label)) {
      continue;
    }
    seen.add(spec.label);
    fields.push({
      label: spec.label,
      value: clamp(value, MAX_FIELD_CHARS),
      mono: spec.mono,
    });
  }

  const lineRange = formatLineRange(record);
  if (lineRange) {
    fields.push({ label: "Lines", value: lineRange, mono: true });
  }

  return fields;
}

function readOutputText(output: unknown): string | null {
  if (typeof output === "string") {
    const trimmed = output.trim();
    return trimmed ? clamp(trimmed, MAX_OUTPUT_CHARS) : null;
  }
  const record = asRecord(output);
  if (!record) {
    return null;
  }

  for (const key of OUTPUT_TEXT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return clamp(value.trim(), MAX_OUTPUT_CHARS);
    }
  }

  const exitCode = record.exitCode ?? record.exit_code;
  const stdout = typeof record.stdout === "string" ? record.stdout.trim() : "";
  const stderr = typeof record.stderr === "string" ? record.stderr.trim() : "";
  if (stdout || stderr || exitCode !== undefined) {
    const chunks = [
      exitCode === undefined ? null : `exit ${String(exitCode)}`,
      stdout ? stdout : null,
      stderr ? `stderr:\n${stderr}` : null,
    ].filter(Boolean);
    return clamp(chunks.join("\n\n"), MAX_OUTPUT_CHARS);
  }

  const flatEntries = Object.entries(record)
    .map(([key, value]) => {
      const printable = toHumanValue(value);
      if (!printable) {
        return null;
      }
      return `${key}: ${clamp(printable, 120)}`;
    })
    .filter((row): row is string => Boolean(row));

  if (flatEntries.length > 0) {
    return clamp(flatEntries.join("\n"), MAX_OUTPUT_CHARS);
  }

  return null;
}

export function buildToolCallDetailSections(params: {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state?: ToolCallState;
  toolName: string;
}): ToolCallDetailSections {
  const output = unwrapEngentyToolExecuteOutput(
    params.toolName,
    params.output ?? params.errorText
  );
  const fields = collectInputFields(params.input);
  const errorMessage =
    params.state === "error"
      ? params.errorText?.trim() ||
        readStringField(asRecord(output), ["error", "message"]) ||
        undefined
      : undefined;
  const outputText =
    params.state === "error"
      ? undefined
      : (readOutputText(output) ?? undefined);

  return {
    fields,
    outputText,
    errorMessage,
  };
}
