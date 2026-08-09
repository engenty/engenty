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
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import {
  appendOrReplaceTranscriptToolPart,
  appendTextDeltaToTranscriptParts,
  buildRunningToolPart,
  toolResultPayloadToAssistantDynamicToolPart,
} from "../sessions/transcript.js";
import { buildUnresolvedToolCallResult } from "./unresolved-tool-call.js";

/** The session event shapes we map (a subset of the full union). */
export interface SessionEventLike {
  agentType?: string;
  args?: unknown;
  /** Streamed tool-args fragment (`tool_input_delta`). */
  argsTextDelta?: string;
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
  // toolCallId → name, for every call opened. Paired with the two sets below to
  // find calls that ended the run still unanswered (see getUnresolvedToolCalls).
  readonly #toolCallNames = new Map<string, string>();
  readonly #resolvedToolCalls = new Set<string>();
  // Suspended calls (frontend tool / approval gate) are LEGITIMATELY resultless:
  // the run parks and the resume completes them. They must never be reported as
  // unresolved.
  readonly #suspendedToolCalls = new Set<string>();
  // Tool calls that already received at least one TOOL_CALL_ARGS delta. A later
  // `tool_start` often carries the complete args object for the same call; if we
  // append that after streamed deltas, the transcript shows the JSON twice
  // (invalid concatenated objects in the inspector). Only emit full args from
  // `tool_start` when nothing has been streamed yet.
  readonly #emittedArgsToolCalls = new Set<string>();
  // Args deltas that arrived for a call whose TOOL_CALL_START is still withheld
  // (nameless `tool_input_start`, see the hold below). Emitting them straight
  // away orphans them: the client routes TOOL_CALL_ARGS to a tool call it has
  // never been told about, so it drops them and the transcript keeps only the
  // TAIL of the JSON under a nameless "tool" placeholder. Buffer here and flush
  // in order the moment the named start opens the call.
  readonly #pendingArgsDeltas = new Map<string, string[]>();
  // Complete args per call, for the durable transcript part — set only by a
  // `tool_start` that carries the whole object.
  readonly #toolCallArgs = new Map<string, unknown>();
  // Raw streamed args JSON per call, accumulated from every delta. Most calls
  // NEVER get a `tool_start` with args: they stream. Without this the persisted
  // part carries no `input` at all, and replaying that history to the provider
  // fails the whole turn with
  //   "If tool_calls are present in the message, function.arguments must be
  //    defined"
  // — a poisoned thread that cannot recover on its own.
  readonly #toolCallArgsText = new Map<string, string>();
  // The assistant turn as durable message PARTS, accumulated alongside the AG-UI
  // wire. Mastra memory only flushes at end-of-generation, so a turn that ends on
  // an interrupt — a suspend, or a requestDecision artifact, which ABORTS the run
  // — persists nothing at all. The executor writes these at run teardown instead,
  // otherwise the next turn reads an EMPTY history and the model re-asks the very
  // question the user already answered, forever.
  #transcriptParts: unknown[] = [];
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
   * The assistant turn so far, as durable message parts. Written to the thread
   * store at run teardown so an interrupted turn survives in history — see
   * `#transcriptParts`.
   */
  getTranscriptParts(): readonly unknown[] {
    return this.#transcriptParts;
  }

  #recordArgsText(toolCallId: string, delta: string): void {
    if (!(toolCallId && delta)) {
      return;
    }
    this.#toolCallArgsText.set(
      toolCallId,
      `${this.#toolCallArgsText.get(toolCallId) ?? ""}${delta}`
    );
  }

  /**
   * The args to persist for a call. NEVER undefined: a tool part without a
   * defined `input` replays as a tool_call with no `function.arguments`, which
   * the provider rejects outright (400) — so an unknown value has to degrade to
   * `{}` rather than to nothing.
   */
  #resolveToolInput(toolCallId: string): unknown {
    const complete = this.#toolCallArgs.get(toolCallId);
    if (complete !== undefined) {
      return complete;
    }
    const text = this.#toolCallArgsText.get(toolCallId)?.trim();
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        // Args still mid-stream (or the provider sent malformed JSON): keep the
        // raw text rather than dropping what the model actually sent.
        return text;
      }
    }
    return {};
  }

  #recordToolPart(part: ReturnType<typeof buildRunningToolPart>): void {
    // Single choke point for the "arguments are always defined" invariant. Some
    // builders legitimately ignore args — the decision/feedback artifact branch
    // of toolResultPayloadToAssistantDynamicToolPart renders from the artifact
    // alone — but a persisted part without `input` replays as a tool_call with
    // no function.arguments and the provider 400s the entire request.
    const withArgs =
      part.input === undefined
        ? { ...part, input: this.#resolveToolInput(part.toolCallId ?? "") }
        : part;
    this.#transcriptParts = appendOrReplaceTranscriptToolPart(
      this.#transcriptParts,
      withArgs
    );
  }

  /**
   * Settle a tool call in the DURABLE transcript only, without touching the
   * AG-UI wire. The executor needs this for a decision/feedback artifact: it
   * intercepts that `tool_end` and aborts the run before the converter ever
   * sees it (the plain TOOL_CALL_RESULT is deliberately suppressed in favour of
   * the interactive interrupt). Without this the persisted turn keeps the tool
   * call stuck at `input-streaming` and the next turn cannot see WHAT was asked.
   */
  recordToolResultPart(payload: {
    args?: unknown;
    isError?: boolean;
    result: unknown;
    toolCallId: string;
    toolName?: string;
  }): void {
    if (!payload.toolCallId) {
      return;
    }
    this.#recordToolPart(
      toolResultPayloadToAssistantDynamicToolPart({
        args: payload.args ?? this.#resolveToolInput(payload.toolCallId),
        ...(payload.isError === true ? { isError: true } : {}),
        result: payload.result,
        toolCallId: payload.toolCallId,
        toolName:
          payload.toolName ||
          this.#toolCallNames.get(payload.toolCallId) ||
          "tool",
      })
    );
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
      type: EventType.CUSTOM,
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
              type: EventType.TEXT_MESSAGE_START,
            });
          }
          const delta = fullText.slice(already);
          out.push({
            delta,
            messageId,
            type: EventType.TEXT_MESSAGE_CONTENT,
          });
          this.#transcriptParts = appendTextDeltaToTranscriptParts(
            this.#transcriptParts,
            delta
          );
          this.#emittedTextLen.set(messageId, fullText.length);
        }
        if (event.type === "message_end" && this.#openText.has(messageId)) {
          this.#openText.delete(messageId);
          out.push({ messageId, type: EventType.TEXT_MESSAGE_END });
        }
        break;
      }
      case "tool_input_start":
      case "tool_start": {
        const toolCallId = event.toolCallId;
        // Mastra defaults a missing name to "" rather than omitting it, so an
        // empty string here means "the provider chunk had no name yet".
        const toolName =
          typeof event.toolName === "string" ? event.toolName.trim() : "";
        if (typeof toolCallId !== "string") {
          break;
        }
        if (this.#startedToolCalls.has(toolCallId)) {
          // `tool_start` may follow `tool_input_start` for the same call. Emit
          // full args only when nothing was streamed yet (e.g. nameless start
          // held the START until the named `tool_start`). Re-appending after
          // deltas duplicates the JSON in the transcript.
          if (
            event.type === "tool_start" &&
            event.args !== undefined &&
            !this.#emittedArgsToolCalls.has(toolCallId)
          ) {
            this.#emittedArgsToolCalls.add(toolCallId);
            out.push({
              delta: str(event.args),
              messageId: this.#currentMessageId || toolCallId,
              toolCallId,
              type: EventType.TOOL_CALL_ARGS,
            });
          }
          break;
        }
        // A streamed input-start can arrive BEFORE the provider has surfaced
        // the tool name (Azure does this for dynamic tools). Opening the call
        // now would freeze the empty name into the transcript — the named
        // `tool_start` that follows is deduped as already-started, and the UI
        // renders its "tool" placeholder ("Ran tool") forever. Hold the START
        // until the named event; nothing is lost, because `tool_start` always
        // carries the complete args.
        if (!toolName && event.type === "tool_input_start") {
          break;
        }
        this.#startedToolCalls.add(toolCallId);
        this.#toolCallNames.set(toolCallId, toolName || "tool");
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          // Genuinely nameless calls still open (their END/RESULT must pair
          // up); the UI's placeholder is the honest label for those.
          toolCallName: toolName || "tool",
          type: EventType.TOOL_CALL_START,
        });
        // Deltas that streamed while the START was withheld. Flush them now, in
        // arrival order, so the client sees the WHOLE args JSON rather than the
        // tail that survived the hold.
        const buffered = this.#pendingArgsDeltas.get(toolCallId);
        if (buffered?.length) {
          this.#pendingArgsDeltas.delete(toolCallId);
          for (const delta of buffered) {
            out.push({
              delta,
              messageId: this.#currentMessageId || toolCallId,
              toolCallId,
              type: EventType.TOOL_CALL_ARGS,
            });
          }
        }
        if (event.type === "tool_start" && event.args !== undefined) {
          this.#toolCallArgs.set(toolCallId, event.args);
          // Buffered deltas already carry the complete args; appending the full
          // object on top would duplicate the JSON (see #emittedArgsToolCalls).
          if (!this.#emittedArgsToolCalls.has(toolCallId)) {
            this.#emittedArgsToolCalls.add(toolCallId);
            out.push({
              delta: str(event.args),
              messageId: this.#currentMessageId || toolCallId,
              toolCallId,
              type: EventType.TOOL_CALL_ARGS,
            });
          }
        }
        this.#recordToolPart(
          buildRunningToolPart({
            input: this.#resolveToolInput(toolCallId),
            state:
              event.type === "tool_start"
                ? "input-available"
                : "input-streaming",
            toolCallId,
            toolName: toolName || "tool",
          })
        );
        break;
      }
      case "tool_input_delta": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        const delta =
          typeof event.argsTextDelta === "string" ? event.argsTextDelta : "";
        this.#emittedArgsToolCalls.add(toolCallId);
        // Accumulate for the DURABLE part regardless of whether the delta goes
        // out on the wire now or waits for the START below.
        this.#recordArgsText(toolCallId, delta);
        // The call has no TOOL_CALL_START on the wire yet (nameless
        // `tool_input_start` is held until the named event). Emitting now would
        // orphan the delta — the client has no such call to append it to, and
        // drops it. Hold it until the START opens the call.
        if (!this.#startedToolCalls.has(toolCallId)) {
          const acc = this.#pendingArgsDeltas.get(toolCallId);
          if (acc) {
            acc.push(delta);
          } else {
            this.#pendingArgsDeltas.set(toolCallId, [delta]);
          }
          break;
        }
        out.push({
          delta,
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: EventType.TOOL_CALL_ARGS,
        });
        break;
      }
      case "tool_input_end": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId === "string") {
          out.push({
            messageId: this.#currentMessageId || toolCallId,
            toolCallId,
            type: EventType.TOOL_CALL_END,
          });
          // Args are complete now. Fold them onto the durable part here, so a
          // turn that suspends or aborts before `tool_end` still persists what
          // the model actually sent.
          this.#recordToolPart(
            buildRunningToolPart({
              input: this.#resolveToolInput(toolCallId),
              state: "input-available",
              toolCallId,
              toolName: this.#toolCallNames.get(toolCallId) ?? "tool",
            })
          );
        }
        break;
      }
      case "tool_suspended": {
        if (typeof event.toolCallId === "string") {
          this.#suspendedToolCalls.add(event.toolCallId);
        }
        break;
      }
      case "tool_end": {
        const toolCallId = event.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        this.#resolvedToolCalls.add(toolCallId);
        // A tool that streamed args via tool_input_* already emitted END; a
        // tool_start-only call has not. Close it defensively (idempotent on the
        // client — END before RESULT).
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: EventType.TOOL_CALL_END,
        });
        out.push({
          content: str(event.result),
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: EventType.TOOL_CALL_RESULT,
        });
        // Settle the durable part too. A requestDecision/requestFeedback artifact
        // arrives HERE (as a tool result, not a suspend) and the executor aborts
        // the run on it — so this is the only chance to capture the interrupt
        // card in the history the next turn reads.
        this.#recordToolPart(
          toolResultPayloadToAssistantDynamicToolPart({
            args: this.#resolveToolInput(toolCallId),
            ...(event.isError === true ? { isError: true } : {}),
            result: event.result,
            toolCallId,
            toolName: this.#toolCallNames.get(toolCallId) ?? "tool",
          })
        );
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
          type: EventType.TOOL_CALL_START,
        });
        if (typeof event.task === "string" && event.task) {
          out.push({
            delta: str({ task: event.task }),
            messageId: this.#currentMessageId || toolCallId,
            toolCallId,
            type: EventType.TOOL_CALL_ARGS,
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
        this.#resolvedToolCalls.add(toolCallId);
        out.push({
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: EventType.TOOL_CALL_END,
        });
        out.push({
          content: str(event.result),
          messageId: this.#currentMessageId || toolCallId,
          toolCallId,
          type: EventType.TOOL_CALL_RESULT,
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

  /**
   * Tool calls that were opened but never answered and are not parked on a
   * suspend — the run ended with them dangling. A hallucinated tool name lands
   * here: Mastra has nothing to dispatch, so it never emits `tool_end`.
   */
  getUnresolvedToolCalls(): { toolCallId: string; toolName: string }[] {
    const out: { toolCallId: string; toolName: string }[] = [];
    for (const toolCallId of this.#startedToolCalls) {
      if (
        this.#resolvedToolCalls.has(toolCallId) ||
        this.#suspendedToolCalls.has(toolCallId)
      ) {
        continue;
      }
      out.push({
        toolCallId,
        toolName: this.#toolCallNames.get(toolCallId) ?? "tool",
      });
    }
    return out;
  }

  /**
   * Answer every unresolved tool call with an error result, so a card that
   * would otherwise spin forever settles. Emit alongside `finish()` on the
   * paths where the run truly ended (a parked suspend returns earlier and its
   * call is excluded anyway).
   *
   * Pass `knownToolNames` only when the FULL set is available: a partial list
   * would report real tools as nonexistent (see buildUnresolvedToolCallResult).
   */
  closeUnresolvedToolCalls(params?: {
    knownToolNames?: readonly string[];
  }): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    for (const call of this.getUnresolvedToolCalls()) {
      const messageId = this.#currentMessageId || call.toolCallId;
      const result = buildUnresolvedToolCallResult({
        ...(params?.knownToolNames
          ? { knownToolNames: params.knownToolNames }
          : {}),
        toolName: call.toolName,
      });
      // END may already have been emitted (streamed args close the call); the
      // client treats a repeat as a no-op, and a call that never streamed args
      // has none — so send it, same as the `tool_end` branch does.
      out.push({
        messageId,
        toolCallId: call.toolCallId,
        type: EventType.TOOL_CALL_END,
      });
      out.push({
        content: JSON.stringify(result),
        messageId,
        toolCallId: call.toolCallId,
        type: EventType.TOOL_CALL_RESULT,
      });
      this.#recordToolPart(
        toolResultPayloadToAssistantDynamicToolPart({
          args: this.#resolveToolInput(call.toolCallId),
          isError: true,
          result,
          toolCallId: call.toolCallId,
          toolName: call.toolName,
        })
      );
      this.#resolvedToolCalls.add(call.toolCallId);
    }
    return out;
  }

  /** Close any still-open assistant text message (call once the run ends). */
  finish(): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    for (const messageId of this.#openText) {
      out.push({ messageId, type: EventType.TEXT_MESSAGE_END });
    }
    this.#openText.clear();
    return out;
  }
}
