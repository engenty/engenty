import {
  type AGUIEvent,
  readEngentyDebugInitialPromptEventValue,
} from "@engenty/ag-ui-bridge";
import type { EngentyAgUiMessage } from "../../ag-ui/conversation.js";

export interface InspectorToolCall {
  args: string;
  id: string;
  name: string;
  result: string | null;
  status: "started" | "args" | "ended" | "result";
}

export interface InspectorInitialPrompt {
  modelMessages?: unknown;
  runtimeContextInstructions: string;
  systemInstructions: string;
  toolNames: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * A streamed fragment, kept VERBATIM. `readString` trims, which is right for
 * labels and ids but silently destroys args: deltas are concatenated, and the
 * whitespace between two chunks is real content. Trimming them turned
 * "Die Zeiterfassung (234 Einträge" into "DieZeiterfassung(234Einträge" in the
 * inspector — a display artefact that reads exactly like a model or streaming
 * bug and sends you hunting for one.
 */
function readDelta(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export function messagePreview(message: EngentyAgUiMessage): string {
  if (typeof message.content === "string") {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    return message.content
      .flatMap((part) =>
        isRecord(part) && typeof part.text === "string" ? [part.text] : []
      )
      .join(" ")
      .trim();
  }
  return "";
}

function previewText(value: string | null, max = 80): string | null {
  if (!value) {
    return null;
  }
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) {
    return null;
  }
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function shortCallId(id: string): string {
  return `#${id.slice(-6)}`;
}

/**
 * Only TOOL_CALL_START carries the tool name on the wire; ARGS/END/RESULT
 * reference the call by id alone. Index the names once so every row of a call
 * can display it.
 */
export function buildToolCallNameIndex(
  events: readonly AGUIEvent[]
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const event of events) {
    const record = event as Record<string, unknown>;
    const id = readString(record.toolCallId);
    const name = readString(record.toolCallName);
    if (id && name) {
      names.set(id, name);
    }
  }
  return names;
}

/**
 * One stream row, after streamed deltas are folded together.
 *
 * A single tool call arrives as dozens of TOOL_CALL_ARGS chunks ("Schritt",
 * "ster", "äch", …) and assistant text / reasoning as dozens of
 * TEXT_MESSAGE_CONTENT / REASONING_MESSAGE_CONTENT chunks. Rendered one row
 * each — newest-first, so the fragments read BACKWARDS — they bury the events
 * that carry meaning and make the assembled value impossible to read. Fold
 * each adjacent run of same-target deltas into one row carrying the ASSEMBLED
 * value, and keep the chunk count so nothing is silently hidden.
 */
export interface FoldedStreamEvent {
  /** How many wire events this row represents (1 = not folded). */
  chunks: number;
  event: AGUIEvent;
}

const FOLDABLE: Record<string, "messageId" | "toolCallId"> = {
  REASONING_MESSAGE_CONTENT: "messageId",
  TEXT_MESSAGE_CONTENT: "messageId",
  TOOL_CALL_ARGS: "toolCallId",
};

export function foldStreamedDeltas(
  events: readonly AGUIEvent[]
): FoldedStreamEvent[] {
  const out: FoldedStreamEvent[] = [];
  for (const event of events) {
    const record = event as Record<string, unknown>;
    const key = FOLDABLE[String(record.type)];
    const previous = out.at(-1);
    const previousRecord = previous?.event as
      | Record<string, unknown>
      | undefined;
    // Only fold an ADJACENT run targeting the same call/message: that keeps the
    // interleaving of two concurrent tool calls honest.
    if (
      key &&
      previous &&
      previousRecord &&
      previousRecord.type === record.type &&
      previousRecord[key] === record[key]
    ) {
      previousRecord.delta = `${readDelta(previousRecord.delta)}${readDelta(record.delta)}`;
      previous.chunks += 1;
      continue;
    }
    out.push({
      chunks: 1,
      // Copied, because folding mutates `delta` — never edit the caller's events.
      event: (key ? { ...record } : record) as AGUIEvent,
    });
  }
  return out;
}

/**
 * The COMPLETE text behind a stream row, for expanding and copying — the
 * summary shown inline is truncated by design. Prefers the payload that
 * actually carries meaning (assembled args, message text, tool result) and
 * pretty-prints it when it is JSON; falls back to the whole event.
 */
/** Above this, a string field is content to READ, not a value to inspect. */
const LONG_STRING_FIELD = 200;

/**
 * Pretty-printing alone is not enough for the payloads that matter most. A
 * folded `execute_typescript` args row is `{"code":"…13 KB of TypeScript…"}`,
 * and `JSON.stringify(_, null, 2)` keeps that program on ONE line with every
 * newline escaped — the inspector then shows a wall of literal `\n`, which
 * reads like a streaming bug rather than a program. Lift long or multi-line
 * string fields out into labelled blocks so they render as the text they are;
 * the remaining scalar fields still print as JSON.
 */
export function formatPayloadForReading(parsed: unknown): string {
  if (!isRecord(parsed)) {
    return formatJson(parsed);
  }
  const blocks: string[] = [];
  const scalars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (
      typeof value === "string" &&
      (value.length > LONG_STRING_FIELD || value.includes("\n"))
    ) {
      blocks.push(`── ${key} ──\n${value}`);
    } else {
      scalars[key] = value;
    }
  }
  if (blocks.length === 0) {
    return formatJson(parsed);
  }
  return [
    ...(Object.keys(scalars).length > 0 ? [formatJson(scalars)] : []),
    ...blocks,
  ].join("\n\n");
}

export function eventFullText(event: AGUIEvent): string {
  const record = event as Record<string, unknown>;
  const payload =
    readDelta(record.delta) ||
    readDelta(record.content) ||
    readDelta(record.value);
  if (!payload.trim()) {
    return formatJson(record);
  }
  try {
    return formatPayloadForReading(JSON.parse(payload));
  } catch {
    return payload;
  }
}

export function eventSummary(
  event: AGUIEvent,
  toolCallNames?: ReadonlyMap<string, string>
): string {
  const record = event as Record<string, unknown>;
  const toolCallId = readString(record.toolCallId);
  if (toolCallId) {
    // Tool rows: lead with the tool name (resolved via the index for
    // ARGS/END/RESULT, which only carry the call id) and a payload preview
    // instead of a wall of UUIDs.
    const name =
      readString(record.toolCallName) ?? toolCallNames?.get(toolCallId);
    const payload =
      event.type === "TOOL_CALL_ARGS"
        ? previewText(readString(record.delta))
        : event.type === "TOOL_CALL_RESULT"
          ? previewText(readString(record.content))
          : null;
    return [name ?? "tool", shortCallId(toolCallId), payload]
      .filter(Boolean)
      .join(" · ");
  }
  // Everything else: lead with what the event SAYS. A bare messageId/runId
  // tells you nothing at a glance — a wall of "56d95702-ff42-…" rows is the
  // stream at its least useful. Ids move to the muted line in the expanded row
  // (see eventIdentifiers).
  const payload =
    previewText(readDelta(record.delta)) ??
    previewText(readDelta(record.content)) ??
    previewText(typeof record.value === "string" ? record.value : null);
  return (
    [readString(record.name), payload].filter(Boolean).join(" · ") || event.type
  );
}

/**
 * The ids behind a row — shown small and muted when it is expanded, so they are
 * available for correlating events without crowding out the content.
 */
export function eventIdentifiers(event: AGUIEvent): string | null {
  const record = event as Record<string, unknown>;
  const parts = [
    ["message", readString(record.messageId)],
    ["tool call", readString(record.toolCallId)],
    ["run", readString(record.runId)],
    ["thread", readString(record.threadId)],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label} ${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function extractInitialPrompt(
  events: readonly AGUIEvent[]
): InspectorInitialPrompt | null {
  for (const event of [...events].reverse()) {
    const prompt = readEngentyDebugInitialPromptEventValue(
      event as { name?: unknown; type?: unknown; value?: unknown }
    );
    if (prompt) {
      return prompt;
    }
  }
  return null;
}

export function buildToolCallTree(
  events: readonly AGUIEvent[]
): InspectorToolCall[] {
  const calls = new Map<string, InspectorToolCall>();
  for (const event of events) {
    const record = event as Record<string, unknown>;
    const id = readString(record.toolCallId);
    if (!id) {
      continue;
    }
    const current =
      calls.get(id) ??
      ({
        args: "",
        id,
        name: readString(record.toolCallName) ?? "tool",
        result: null,
        status: "started",
      } satisfies InspectorToolCall);
    if (event.type === "TOOL_CALL_START") {
      current.name = readString(record.toolCallName) ?? current.name;
      current.status = "started";
    } else if (event.type === "TOOL_CALL_ARGS") {
      current.args += readDelta(record.delta);
      current.status = "args";
    } else if (event.type === "TOOL_CALL_END") {
      current.status = "ended";
    } else if (event.type === "TOOL_CALL_RESULT") {
      current.result = readString(record.content) ?? formatJson(record);
      current.status = "result";
    }
    calls.set(id, current);
  }
  return Array.from(calls.values()).reverse();
}
