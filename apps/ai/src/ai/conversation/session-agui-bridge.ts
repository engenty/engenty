// Mastra `Session` → AG-UI bridge (Phase 3.0). Maps the session's HIGH-LEVEL
// events (subscribe listener) to the SAME AG-UI wire the UI already speaks —
// deliberately NOT the raw-chunk converter (DurableAgUiConverter) the control
// plane uses, because the session emits at a different altitude:
//   - assistant text arrives as `message_update`/`message_end` carrying the FULL
//     SessionMessage content (text blocks), so we diff per message id to emit
//     TEXT_MESSAGE_CONTENT deltas;
//   - tool calls arrive as `tool_input_start|delta|end` + `tool_start` + `tool_end`;
//   - usage via `usage_update`; failures via `error`.
// Sub-agents (`subagent_*`) and approvals (`tool_approval_required`/`tool_suspended`)
// are layered on in 3.1 / 3.2.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";

/** The session event shapes we map (a subset of the full union). */
export interface SessionEventLike {
  agentType?: string;
  args?: unknown;
  error?: { message?: string } | unknown;
  isError?: boolean;
  message?: {
    /**
     * Mastra 1.52 AgentController messages are `MastraDBMessage`: text lives in
     * `content.parts`. Older session fixtures / adapters may still pass a flat
     * content array of text blocks — both shapes are accepted.
     */
    content?:
      | Array<{ text?: string; type?: string }>
      | {
          parts?: Array<{ text?: string; type?: string }>;
          [key: string]: unknown;
        }
      | string;
    id?: string;
    role?: string;
  };
  result?: unknown;
  subToolName?: string;
  task?: string;
  textDelta?: string;
  toolCallId?: string;
  toolName?: string;
  type?: string;
  usage?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

function textFromBlocks(
  blocks: Array<{ text?: string; type?: string }> | undefined
): string {
  if (!Array.isArray(blocks)) {
    return "";
  }
  return blocks
    .filter((c) => c?.type === "text")
    .map((c) => (typeof c.text === "string" ? c.text : ""))
    .join("");
}

/** Extract assistant plain text from either legacy content[] or MastraDBMessage. */
export function assistantText(content: SessionEventLike["message"]): string {
  if (!content) {
    return "";
  }
  const raw = content.content;
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return textFromBlocks(raw);
  }
  if (raw && typeof raw === "object") {
    return textFromBlocks(
      (raw as { parts?: Array<{ text?: string; type?: string }> }).parts
    );
  }
  return "";
}

/**
 * Stateful per-event converter. Tracks, per assistant message id, how much text
 * has already been emitted (so repeated full-content `message_update`s become
 * deltas) and which text/tool messages are open, keeping the AG-UI stream
 * well-formed (one START per message/tool, END before the next).
 */
export class SessionAgUiConverter {
  // messageId → length of text already emitted as TEXT_MESSAGE_CONTENT.
  readonly #emittedTextLen = new Map<string, number>();
  // messageId → text START emitted (and not yet ended).
  readonly #openText = new Set<string>();
  readonly #startedToolCalls = new Set<string>();
  // The current assistant message id (from message_*). Tool calls must attach to
  // it — Mastra persists tool-invocations as PARTS of the assistant message, so a
  // tool emitted under its own messageId (toolCallId) is an orphan that the client
  // drops when it reconciles to the persisted message on finish (the card vanishes).
  #currentMessageId = "";
  // Accumulated nested sub-agent progress lines per delegation toolCallId (native
  // `subagent_*` events). The executor folds these onto the persisted delegation
  // tool part after the run, same as the control plane (Mastra memory drops them).
  readonly #subAgentProgressLines = new Map<string, string[]>();
  #lastUsage: unknown = null;

  /** The most recent `usage_update` payload, for token-usage recording. */
  get lastUsage(): unknown {
    return this.#lastUsage;
  }

  /** The assistant message id tool cards attach to (for nested progress events). */
  get currentMessageId(): string {
    return this.#currentMessageId;
  }

  /**
   * Record a child-run delegation progress line so it is persisted onto the
   * `agent-<alias>` tool part after the run (same store as native `subagent_*`
   * lines). The executor also emits a live `engenty.sub_agent.progress` event.
   */
  recordSubAgentProgress(toolCallId: string, line: string): void {
    if (!(toolCallId && line.trim())) {
      return;
    }
    const acc = this.#subAgentProgressLines.get(toolCallId);
    if (acc) {
      acc.push(line);
    } else {
      this.#subAgentProgressLines.set(toolCallId, [line]);
    }
  }

  /** Accumulated native sub-agent progress lines per delegation toolCallId. */
  getSubAgentProgressLines(): ReadonlyMap<string, string[]> {
    return this.#subAgentProgressLines;
  }

  #subAgentProgress(toolCallId: string, line: string, out: AGUIEvent[]): void {
    if (!line.trim()) {
      return;
    }
    const acc = this.#subAgentProgressLines.get(toolCallId);
    if (acc) {
      acc.push(line);
    } else {
      this.#subAgentProgressLines.set(toolCallId, [line]);
    }
    out.push({
      name: "engenty.sub_agent.progress",
      type: "CUSTOM",
      value: {
        line,
        messageId: this.#currentMessageId || toolCallId,
        toolCallId,
      },
    } as AGUIEvent);
  }

  convert(event: SessionEventLike): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    // Track the current assistant message id from any message_* event so tool
    // calls / sub-agent cards attach to it (matching the persisted message shape).
    if (
      event.message?.role === "assistant" &&
      typeof event.message.id === "string" &&
      event.message.id
    ) {
      this.#currentMessageId = event.message.id;
    }
    switch (event.type) {
      case "message_update":
      case "message_end": {
        if (event.message?.role !== "assistant") {
          break;
        }
        const messageId = event.message.id || "assistant";
        const fullText = assistantText(event.message);
        const already = this.#emittedTextLen.get(messageId) ?? 0;
        if (fullText.length > already) {
          if (!this.#openText.has(messageId)) {
            this.#openText.add(messageId);
            out.push({
              messageId,
              role: "assistant",
              type: "TEXT_MESSAGE_START",
            });
          }
          out.push({
            delta: fullText.slice(already),
            messageId,
            type: "TEXT_MESSAGE_CONTENT",
          });
          this.#emittedTextLen.set(messageId, fullText.length);
        }
        if (event.type === "message_end" && this.#openText.has(messageId)) {
          this.#openText.delete(messageId);
          out.push({ messageId, type: "TEXT_MESSAGE_END" });
        }
        break;
      }
      case "tool_input_start":
      case "tool_start": {
        const toolCallId = event.toolCallId;
        const toolName = event.toolName;
        if (typeof toolCallId !== "string" || typeof toolName !== "string") {
          break;
        }
        if (this.#startedToolCalls.has(toolCallId)) {
          // `tool_start` may follow `tool_input_start` for the same call; the
          // START is already open — only emit args for the full-args `tool_start`.
          if (event.type === "tool_start" && event.args !== undefined) {
            out.push({
              delta: str(event.args),
              messageId: this.#currentMessageId || toolCallId,
              toolCallId,
              type: "TOOL_CALL_ARGS",
            });
          }
          break;
        }
        this.#startedToolCalls.add(toolCallId);
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          toolCallName: toolName,
          type: "TOOL_CALL_START",
        });
        if (event.type === "tool_start" && event.args !== undefined) {
          out.push({
            delta: str(event.args),
            messageId: this.#currentMessageId || toolCallId,
            toolCallId,
            type: "TOOL_CALL_ARGS",
          });
        }
        break;
      }
      case "tool_input_delta": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        const delta = (event as { argsTextDelta?: unknown }).argsTextDelta;
        out.push({
          delta: typeof delta === "string" ? delta : "",
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: "TOOL_CALL_ARGS",
        });
        break;
      }
      case "tool_input_end": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId === "string") {
          out.push({
            messageId: this.#currentMessageId || toolCallId,
            toolCallId,
            type: "TOOL_CALL_END",
          });
        }
        break;
      }
      case "tool_end": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        // A tool that streamed args via tool_input_* already emitted END; a
        // tool_start-only call has not. Close it defensively (idempotent on the
        // client — END before RESULT).
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: "TOOL_CALL_END",
        });
        out.push({
          content: str(event.result),
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: "TOOL_CALL_RESULT",
        });
        break;
      }
      // Native Mastra sub-agents (AgentControllerConfig.subagents) stream `subagent_*`
      // events keyed by the delegation toolCallId. Render the delegation as an
      // `agent-<type>` tool card (UI routes that to the rich sub-agent card) and
      // its inner activity as nested progress lines — the same shape the copilot
      // UI already speaks. (Engenty's CLI stays Agent-level for its sandbox, so
      // these don't fire today; this keeps the converter complete for native ones.)
      case "subagent_start": {
        const toolCallId = event.toolCallId;
        if (
          typeof toolCallId !== "string" ||
          this.#startedToolCalls.has(toolCallId)
        ) {
          break;
        }
        this.#startedToolCalls.add(toolCallId);
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          toolCallName: `agent-${event.agentType ?? "subagent"}`,
          type: "TOOL_CALL_START",
        });
        if (typeof event.task === "string" && event.task) {
          out.push({
            delta: str({ task: event.task }),
            messageId: this.#currentMessageId || toolCallId,
            toolCallId,
            type: "TOOL_CALL_ARGS",
          });
        }
        break;
      }
      case "subagent_text_delta": {
        if (
          typeof event.toolCallId === "string" &&
          typeof event.textDelta === "string"
        ) {
          this.#subAgentProgress(event.toolCallId, event.textDelta, out);
        }
        break;
      }
      case "subagent_tool_start": {
        if (
          typeof event.toolCallId === "string" &&
          typeof event.subToolName === "string"
        ) {
          this.#subAgentProgress(
            event.toolCallId,
            `Running ${event.subToolName}`,
            out
          );
        }
        break;
      }
      case "subagent_end": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: "TOOL_CALL_END",
        });
        out.push({
          content: str(event.result),
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: "TOOL_CALL_RESULT",
        });
        break;
      }
      case "usage_update":
        this.#lastUsage = event.usage ?? null;
        break;
      default:
        break;
    }
    return out;
  }

  /** Close any still-open assistant text message (call once the run ends). */
  finish(): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    for (const messageId of this.#openText) {
      out.push({ messageId, type: "TEXT_MESSAGE_END" });
    }
    this.#openText.clear();
    return out;
  }
}
