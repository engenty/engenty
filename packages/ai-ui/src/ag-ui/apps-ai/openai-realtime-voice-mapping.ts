import type { RealtimeVoiceUiStatus } from "../../components/realtime-voice/realtime-voice.js";
import type {
  RealtimeVoiceEvent,
  RealtimeVoiceToolCallRequest,
  RealtimeVoiceToolDefinition,
  RealtimeVoiceTranscriptUpdate,
} from "./realtime-voice-events.js";

/**
 * OpenAI Realtime wire ↔ normalized voice model. Everything that knows an
 * OpenAI event name lives here (or in the WebRTC transport), never in the
 * session hook.
 */

export function realtimeVoiceStatusFromOpenAiEvent(
  event: unknown
): RealtimeVoiceUiStatus | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const type = "type" in event ? event.type : null;
  if (typeof type !== "string") {
    return null;
  }
  if (
    type === "response.audio.delta" ||
    type === "response.audio_transcript.delta" ||
    type === "response.output_audio.delta" ||
    type === "response.output_audio_transcript.delta" ||
    type === "output_audio_buffer.started"
  ) {
    return "speaking";
  }
  if (
    type === "input_audio_buffer.speech_started" ||
    type === "response.audio.done" ||
    type === "response.done" ||
    type === "response.output_audio.done" ||
    type === "response.output_audio_transcript.done" ||
    type === "output_audio_buffer.stopped"
  ) {
    return "listening";
  }
  if (type === "error") {
    return "error";
  }
  return null;
}

export function realtimeVoiceTranscriptFromOpenAiEvent(
  event: unknown
): RealtimeVoiceTranscriptUpdate | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const type = "type" in event ? event.type : null;
  if (typeof type !== "string") {
    return null;
  }
  if (type === "conversation.item.input_audio_transcription.completed") {
    const transcript = "transcript" in event ? event.transcript : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof transcript === "string"
      ? { done: true, itemId, mode: "replace", role: "user", text: transcript }
      : null;
  }
  if (
    type === "response.audio_transcript.delta" ||
    type === "response.output_audio_transcript.delta"
  ) {
    const delta = "delta" in event ? event.delta : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof delta === "string"
      ? { itemId, mode: "append", role: "assistant", text: delta }
      : null;
  }
  if (
    type === "response.audio_transcript.done" ||
    type === "response.output_audio_transcript.done"
  ) {
    const transcript = "transcript" in event ? event.transcript : null;
    const itemId = readStringProperty(event, "item_id", "itemId");
    return typeof transcript === "string"
      ? {
          done: true,
          itemId,
          mode: "replace",
          role: "assistant",
          text: transcript,
        }
      : null;
  }
  return null;
}

export function openAiRealtimeVoiceToolCallsFromOpenAiEvent(
  event: unknown
): RealtimeVoiceToolCallRequest[] {
  if (!event || typeof event !== "object") {
    return [];
  }
  const type = "type" in event ? event.type : null;
  if (type === "response.function_call_arguments.done") {
    const callId = readStringProperty(event, "call_id", "callId");
    const name = readStringProperty(event, "name");
    if (!(callId && name)) {
      return [];
    }
    return [
      {
        arguments: parseToolArguments(
          "arguments" in event ? event.arguments : "{}"
        ),
        callId,
        name,
      },
    ];
  }
  if (type !== "response.done") {
    return [];
  }
  const response = "response" in event ? event.response : null;
  const output =
    response && typeof response === "object" && "output" in response
      ? response.output
      : null;
  if (!Array.isArray(output)) {
    return [];
  }
  return output.flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("type" in item) ||
      item.type !== "function_call"
    ) {
      return [];
    }
    const callId = readStringProperty(item, "call_id", "callId");
    const name = readStringProperty(item, "name");
    if (!(callId && name)) {
      return [];
    }
    return [
      {
        arguments: parseToolArguments(
          "arguments" in item ? item.arguments : "{}"
        ),
        callId,
        name,
      },
    ];
  });
}

export function openAiRealtimeVoiceSessionToolEvents(
  tools: readonly RealtimeVoiceToolDefinition[]
): readonly unknown[] {
  if (tools.length === 0) {
    return [];
  }
  return [
    {
      session: {
        type: "realtime",
        tool_choice: "auto",
        tools: tools.map((tool) => ({
          description: tool.description,
          name: tool.name,
          parameters: tool.parameters ?? { type: "object" },
          type: "function",
        })),
      },
      type: "session.update",
    },
  ];
}

/** OpenAI client events that return a tool result and resume the turn. */
export function openAiRealtimeVoiceToolOutputEvents(
  callId: string,
  output: unknown
): readonly unknown[] {
  return [
    {
      item: {
        call_id: callId,
        output: stringifyToolOutput(output),
        type: "function_call_output",
      },
      type: "conversation.item.create",
    },
    { type: "response.create" },
  ];
}

/** Map one raw OpenAI realtime event onto normalized voice events. */
export function openAiEventsToRealtimeVoiceEvents(
  event: unknown
): RealtimeVoiceEvent[] {
  const events: RealtimeVoiceEvent[] = [];
  if (isOpenAiRealtimeEventType(event, "input_audio_buffer.speech_started")) {
    events.push({ type: "speech-started" });
  }
  const transcript = realtimeVoiceTranscriptFromOpenAiEvent(event);
  if (transcript) {
    events.push({ type: "transcript", ...transcript });
  }
  const calls = openAiRealtimeVoiceToolCallsFromOpenAiEvent(event);
  if (calls.length > 0) {
    events.push({ type: "tool-call", calls });
  }
  const status = realtimeVoiceStatusFromOpenAiEvent(event);
  if (status === "error") {
    events.push({
      type: "error",
      message: readOpenAiRealtimeErrorMessage(event),
    });
  } else if (status === "speaking" || status === "listening") {
    events.push({ type: "status", status });
  }
  return events;
}

function isOpenAiRealtimeEventType(event: unknown, type: string): boolean {
  return (
    event !== null &&
    typeof event === "object" &&
    "type" in event &&
    event.type === type
  );
}

function readOpenAiRealtimeErrorMessage(event: unknown): string {
  if (!(event && typeof event === "object")) {
    return "Realtime voice event error";
  }
  const record = event as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }
  const message = record.message;
  return typeof message === "string" && message.trim()
    ? message.trim()
    : "Realtime voice event error";
}

function readStringProperty(
  value: object,
  ...keys: string[]
): string | undefined {
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return;
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") {
    return {};
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function stringifyToolOutput(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({ error: "Tool output is not serializable" });
  }
}
