// Slim transcript view (`GET /ai/threads/:id/messages?view=slim`).
//
// A long thread's page is mostly bytes the transcript never draws: persisted
// reasoning parts (no renderer reads them — see copilot-adapter
// `partsFromTranscriptParts`) and large tool results that only show once a
// step or card is expanded. The slim view drops those and flags what it
// dropped; the client fetches the full row (`GET …/messages/:messageId`)
// when someone opens a slimmed step.
//
// A tool result is only slimmed when nothing in the collapsed transcript
// reads it: completed calls, over the size budget, from a tool with no card
// of its own, carrying none of the markers a card matches on.

/** Tool results whose JSON is at most this many characters are kept. */
export const SLIM_TOOL_RESULT_MAX_CHARS = 2048;

/** The key that marks a slimmed tool result placeholder. */
export const SLIM_TOOL_RESULT_MARKER = "_slim";

/** What a slimmed tool result is replaced with. */
export interface SlimToolResultPlaceholder {
  _slim: true;
  /** Characters of the dropped result's JSON. */
  bytes: number;
  /** The persisted row (`ai.thread_message.id`) holding the full result. */
  message_id: string;
  thread_id: string;
}

export function isSlimToolResult(
  value: unknown
): value is SlimToolResultPlaceholder {
  return (
    isRecord(value) &&
    value[SLIM_TOOL_RESULT_MARKER] === true &&
    typeof value.message_id === "string" &&
    typeof value.thread_id === "string"
  );
}

/**
 * Tools whose result the collapsed transcript reads by NAME: decision and
 * interrupt tools, standalone cards, citations, web-search chips, sub-agent
 * delegations. Checked against the wire name and against the inner tool a
 * wrapper (`engenty_tool_execute`, `invoke_frontend_tool`) names in its args.
 */
const KEEP_RESULT_TOOL_NAMES = new Set([
  "agent_look",
  "artifact_write",
  "connections_request_connect",
  "knowledge_base_article_search",
  "loadContact",
  // Its card opens on the command's output by default.
  "mastra_workspace_execute_command",
  "message_agent",
  "offer_file_downloads",
  "reasoning",
  "requestDecision",
  "requestFeedback",
  "show_artifact",
  "show_objects",
  "show_ui",
  "show_widget",
  "computer_skills_find",
  "skills_find",
  "workflow_propose",
]);

/** Result keys a card or guard matches on (`_meta.engenty.*`, artifacts, …). */
const UI_MARKER_KEYS = [
  "_meta",
  "__type",
  "app_id",
  "artifact_emitted",
  "artifact_id",
  "artifact_type",
  "interrupt_id",
  "sub_thread_id",
];

/** Arg keys a wrapper tool names its inner tool under. */
const INNER_TOOL_NAME_KEYS = [
  "contractId",
  "contract_id",
  "id",
  "name",
  "tool_id",
  "tool_name",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isKeptToolName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    KEEP_RESULT_TOOL_NAMES.has(name) ||
    name.startsWith("agent-") ||
    lower.includes("web_search") ||
    lower.includes("websearch")
  );
}

function namesKeptTool(toolName: string, args: unknown): boolean {
  if (isKeptToolName(toolName)) {
    return true;
  }
  if (!isRecord(args)) {
    return false;
  }
  return INNER_TOOL_NAME_KEYS.some((key) => {
    const value = args[key];
    return typeof value === "string" && isKeptToolName(value.trim());
  });
}

function carriesUiMarker(result: unknown): boolean {
  const layers = [result];
  if (isRecord(result)) {
    layers.push(result.output, result.result);
  }
  return layers.some(
    (layer) => isRecord(layer) && UI_MARKER_KEYS.some((key) => key in layer)
  );
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? null)?.length ?? 0;
  } catch {
    return 0;
  }
}

interface ToolResultSlot {
  approval: boolean;
  args: unknown;
  completed: boolean;
  result: unknown;
  toolName: string;
  write: (placeholder: SlimToolResultPlaceholder) => Record<string, unknown>;
}

/** The result a tool part carries, in any of the three persisted shapes. */
function readToolResultSlot(
  part: Record<string, unknown>
): ToolResultSlot | null {
  const type = typeof part.type === "string" ? part.type : "";
  if (type === "tool-invocation" && isRecord(part.toolInvocation)) {
    const invocation = part.toolInvocation;
    return {
      approval: "approval" in invocation || "approval" in part,
      args: invocation.args ?? invocation.input,
      completed: invocation.state === "result" || invocation.state === "done",
      result: invocation.result,
      toolName:
        typeof invocation.toolName === "string" ? invocation.toolName : "",
      write: (placeholder) => ({
        ...part,
        toolInvocation: { ...invocation, result: placeholder },
        truncated: true,
      }),
    };
  }
  if (type === "dynamic-tool" || type.startsWith("tool-")) {
    return {
      approval: "approval" in part,
      args: part.input,
      completed: part.state === "output-available",
      result: part.output,
      toolName:
        type === "dynamic-tool"
          ? typeof part.toolName === "string"
            ? part.toolName
            : ""
          : type.slice("tool-".length),
      write: (placeholder) => ({
        ...part,
        output: placeholder,
        truncated: true,
      }),
    };
  }
  return null;
}

function slimReasoningPart(
  part: Record<string, unknown>
): Record<string, unknown> | null {
  const hasText =
    (typeof part.reasoning === "string" && part.reasoning.length > 0) ||
    (typeof part.text === "string" && part.text.length > 0) ||
    (Array.isArray(part.details) && part.details.length > 0);
  if (!hasText) {
    return null;
  }
  const slim: Record<string, unknown> = { ...part, truncated: true };
  if ("reasoning" in slim) {
    slim.reasoning = "";
  }
  if ("text" in slim) {
    slim.text = "";
  }
  if ("details" in slim) {
    slim.details = [];
  }
  return slim;
}

function slimToolPart(
  part: Record<string, unknown>,
  ids: { messageId: string; threadId: string }
): Record<string, unknown> | null {
  const slot = readToolResultSlot(part);
  if (
    !slot?.completed ||
    slot.result === undefined ||
    // A call parked on an approval is an open interrupt, not history.
    slot.approval ||
    namesKeptTool(slot.toolName.trim(), slot.args) ||
    carriesUiMarker(slot.result)
  ) {
    return null;
  }
  const bytes = jsonLength(slot.result);
  if (bytes <= SLIM_TOOL_RESULT_MAX_CHARS) {
    return null;
  }
  return slot.write({
    _slim: true,
    bytes,
    message_id: ids.messageId,
    thread_id: ids.threadId,
  });
}

interface SlimmableThreadMessage {
  id: string;
  metadata?: Record<string, unknown> | null;
  parts: unknown;
  role: string;
  thread_id: string;
}

/**
 * Row metadata keys no transcript reader uses. `suspendedTools` is Mastra's
 * own resume record (tool args + JSON schema per suspended call, left on the
 * row after the call resolved); resumes read it server-side from memory, and
 * open interrupts reach the client through the thread and the run stream.
 */
const SLIM_DROPPED_METADATA_KEYS = ["suspendedTools"];

function slimParts(message: SlimmableThreadMessage): unknown[] | null {
  if (message.role !== "assistant" || !Array.isArray(message.parts)) {
    return null;
  }
  const ids = { messageId: message.id, threadId: message.thread_id };
  let slimmed = false;
  const parts = message.parts.map((part: unknown) => {
    if (!isRecord(part)) {
      return part;
    }
    const next =
      part.type === "reasoning"
        ? slimReasoningPart(part)
        : slimToolPart(part, ids);
    if (!next) {
      return part;
    }
    slimmed = true;
    return next;
  });
  return slimmed ? parts : null;
}

/**
 * The slim view of one persisted row: assistant rows lose reasoning text and
 * large unread tool results; any row loses `SLIM_DROPPED_METADATA_KEYS`. A
 * user's words and a frontend tool's result row keep their parts. Rows that
 * lose anything get `metadata.slim = true`; the rest are returned untouched.
 */
export function slimThreadMessage<T extends SlimmableThreadMessage>(
  message: T
): T {
  const parts = slimParts(message);
  const metadata = message.metadata ?? {};
  const dropped = SLIM_DROPPED_METADATA_KEYS.filter((key) => key in metadata);
  if (!parts && dropped.length === 0) {
    return message;
  }
  const nextMetadata: Record<string, unknown> = { ...metadata, slim: true };
  for (const key of dropped) {
    delete nextMetadata[key];
  }
  return {
    ...message,
    metadata: nextMetadata,
    ...(parts ? { parts } : {}),
  };
}
