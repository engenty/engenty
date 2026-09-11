// The AG-UI event stream, folded back into what actually happened.
//
// A tool call arrives as four or more separate events — START carries the
// name, ARGS carries the arguments in chunks, RESULT carries what came back,
// and END fires more than once — all tied together only by `toolCallId`.
// Rendered flat, that reads as three identical "Called skill" rows with the
// arguments missing and the results orphaned somewhere below. Folded, it reads
// as three calls that each loaded a different skill and got an answer.
import type { AiRunEventRecord } from "../../lib/admin/ai-runtime-types.js";

export interface RunTimelineCall {
  /** Arguments as sent, minus harness plumbing. Empty when the tool takes none. */
  args: string;
  id: string;
  kind: "call";
  name: string;
  result: string | null;
  seq: number;
  time: string;
}

export interface RunTimelineNote {
  detail: string | null;
  isError: boolean;
  kind: "note";
  label: string;
  seq: number;
  time: string;
}

export type RunTimelineEntry = RunTimelineCall | RunTimelineNote;

const NOTE_LABEL: Record<string, string> = {
  RUN_ERROR: "Error",
  RUN_FINISHED: "Finished",
  RUN_STARTED: "Started",
  STEP_FINISHED: "Step finished",
  STEP_STARTED: "Step",
};

/** Every call carries this; it is transport config, never what was asked. */
function stripPlumbing(args: string): string {
  const trimmed = args.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const { _background, ...rest } = parsed;
    return Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";
  } catch {
    // Arguments arrive chunked; a truncated run leaves the last one unparseable.
    return trimmed;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function buildRunTimeline(
  events: readonly AiRunEventRecord[]
): RunTimelineEntry[] {
  const calls = new Map<string, RunTimelineCall>();
  const entries: RunTimelineEntry[] = [];

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    const callId = text(payload.toolCallId) ?? text(payload.tool_call_id);

    if (event.event_type === "TOOL_CALL_START" && callId) {
      const call: RunTimelineCall = {
        args: "",
        id: callId,
        kind: "call",
        name:
          text(payload.toolCallName) ?? text(payload.tool_call_name) ?? "tool",
        result: null,
        seq: event.seq,
        time: event.created_at,
      };
      calls.set(callId, call);
      entries.push(call);
      continue;
    }
    if (event.event_type === "TOOL_CALL_ARGS" && callId) {
      const call = calls.get(callId);
      if (call) {
        call.args += text(payload.delta) ?? "";
      }
      continue;
    }
    if (event.event_type === "TOOL_CALL_RESULT" && callId) {
      const call = calls.get(callId);
      if (call) {
        call.result = text(payload.content) ?? event.message;
      }
      continue;
    }
    const label = NOTE_LABEL[event.event_type];
    if (label) {
      entries.push({
        detail: event.message,
        isError: event.level === "error" || event.event_type === "RUN_ERROR",
        kind: "note",
        label,
        seq: event.seq,
        time: event.created_at,
      });
    }
  }

  for (const call of calls.values()) {
    call.args = stripPlumbing(call.args);
  }
  return entries;
}

/**
 * What was asked. The prompt arrives as a `role: "user"` TEXT_MESSAGE_START,
 * then content deltas that carry no role of their own, then an END — so the
 * role has to be remembered across the span. Null for a run nobody typed into
 * (a routine's brief reaches the model another way), and the caller then shows
 * nothing rather than an empty box.
 */
export function readRunPrompt(
  events: readonly AiRunEventRecord[]
): string | null {
  let open = false;
  let prompt = "";
  for (const event of events) {
    const payload = event.payload as Record<string, unknown>;
    if (event.event_type === "TEXT_MESSAGE_START") {
      open = payload.role === "user";
      continue;
    }
    if (event.event_type === "TEXT_MESSAGE_END") {
      if (open && prompt.trim()) {
        return prompt.trim();
      }
      open = false;
      continue;
    }
    if (open && event.event_type === "TEXT_MESSAGE_CONTENT") {
      prompt += text(payload.delta) ?? "";
    }
  }
  return prompt.trim() || null;
}
