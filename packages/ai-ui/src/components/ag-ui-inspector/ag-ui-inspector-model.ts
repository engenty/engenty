import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import type { EngentyAgUiMessage } from "../../ag-ui/conversation.js";

export interface InspectorToolCall {
  args: string;
  id: string;
  name: string;
  result: string | null;
  status: "started" | "args" | "ended" | "result";
}

export interface InspectorInitialPrompt {
  modelMessages: unknown;
  runtimeContextInstructions: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

export function eventSummary(event: AGUIEvent): string {
  const record = event as Record<string, unknown>;
  const parts = [
    readString(record.name),
    readString(record.messageId),
    readString(record.toolCallName),
    readString(record.toolCallId),
    readString(record.runId),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : event.type;
}

export function extractInitialPrompt(
  events: readonly AGUIEvent[]
): InspectorInitialPrompt | null {
  for (const event of [...events].reverse()) {
    if (event.type !== "CUSTOM") {
      continue;
    }
    const record = event as Record<string, unknown>;
    if (record.name !== "engenty.debug.initial_prompt") {
      continue;
    }
    const value = record.value;
    if (!isRecord(value)) {
      continue;
    }
    return {
      modelMessages: value.modelMessages,
      runtimeContextInstructions:
        readString(value.runtimeContextInstructions) ?? "",
    };
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
      current.args += readString(record.delta) ?? "";
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
