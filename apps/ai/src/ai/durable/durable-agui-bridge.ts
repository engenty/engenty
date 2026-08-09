// Durable run → AG-UI bridge. Maps a `DurableAgent` stream's chunks to the AG-UI
// wire events the frontend already speaks, reusing the exact event shapes the
// live path emits (see apps/ai/src/ai/sessions/detached-run.ts).
//
// This is a NEW, focused converter for the durable path — deliberately NOT an
// extraction of harness.ts's stateful reducer (that one is tangled with
// sub-agent delegation / interrupts / frontend-tools / transcript state). It
// covers the core chunk types a durable run emits: text + tool-call + tool-result.
// Sub-agent/interrupt/frontend-tool handling is layered on later, once the
// vertical slice is wired.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import { buildUnresolvedToolCallResult } from "../conversation/unresolved-tool-call.js";
import {
  appendOrReplaceTranscriptToolPart,
  appendTextDeltaToTranscriptParts,
  buildRunningToolPart,
  formatSubAgentProgressLine,
  isSubAgentDelegationToolName,
  toolResultPayloadToAssistantDynamicToolPart,
} from "../sessions/transcript.js";

interface DurableChunk {
  payload?: Record<string, unknown>;
  type?: string;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Stateful per-chunk converter. Tracks the open text message id and which tool
 * calls have already emitted a START, so the emitted AG-UI stream is well-formed
 * (START → CONTENT* → END, one START per tool call).
 */
export class DurableAgUiConverter {
  #messageId = "";
  #textOpen = false;
  // The in-flight sub-agent delegation tool call (`agent-*`). Nested
  // agent-execution-event-* chunks belong to it, so progress lines attach there.
  #activeSubAgentDelegationToolCallId: string | null = null;
  readonly #startedToolCalls = new Set<string>();
  // Calls that produced a result, and calls that parked the run. Everything
  // STARTED but in neither set dangles: the client's card spins forever and the
  // persisted part stays at `state:"call"`. See closeUnresolvedToolCalls().
  readonly #resolvedToolCalls = new Set<string>();
  readonly #suspendedToolCalls = new Set<string>();
  readonly #toolCallNames = new Map<string, string>();
  readonly #toolCallArgs = new Map<string, unknown>();
  // Accumulated sub-agent progress lines per delegation toolCallId. The live
  // CUSTOM events only patch the in-flight message; Mastra memory persists the
  // tool part WITHOUT these app-level lines, so the executor folds them back onto
  // the saved part after the run (else the sub-agent card's Log + drill-in are
  // empty on reload). See getSubAgentProgressLines().
  readonly #subAgentProgressLines = new Map<string, string[]>();
  // The turn so far as durable message parts. A resumed turn that ends on a
  // second suspend never reaches end-of-generation, so Mastra memory flushes
  // NOTHING — without this the whole continuation is lost and the next turn
  // re-asks what the user already answered. Mirrors SessionAgUiConverter.
  #transcriptParts: unknown[] = [];
  // Token usage reported by the run's `finish` chunk, for metering + the
  // durable run row. Every resumed turn was previously unbilled.
  #lastUsage: unknown;

  /** Token usage from the last `finish` chunk, or undefined if none arrived. */
  get lastUsage(): unknown {
    return this.#lastUsage;
  }

  /** The assistant turn so far, as durable message parts. */
  getTranscriptParts(): readonly unknown[] {
    return this.#transcriptParts;
  }

  /**
   * Tool calls that STARTED and never settled — neither a result nor a suspend.
   * A tool the model invents mid-continuation lands here.
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
   * Answer every dangling call with an explicit error, on the wire AND in the
   * durable transcript. Without it the card spins forever in the live window
   * and the model never learns the call failed, so it re-invents the same tool
   * on the next turn.
   */
  closeUnresolvedToolCalls(params?: {
    knownToolNames?: readonly string[];
  }): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    for (const { toolCallId, toolName } of this.getUnresolvedToolCalls()) {
      const result = buildUnresolvedToolCallResult({
        toolName,
        ...(params?.knownToolNames
          ? { knownToolNames: params.knownToolNames }
          : {}),
      });
      this.#resolvedToolCalls.add(toolCallId);
      this.#recordToolResultPart({
        isError: true,
        result,
        toolCallId,
        toolName,
      });
      out.push({
        content: str(result),
        messageId: this.#messageId || toolCallId,
        toolCallId,
        type: EventType.TOOL_CALL_RESULT,
      });
    }
    return out;
  }

  #recordToolResultPart(payload: {
    isError?: boolean;
    result: unknown;
    toolCallId: string;
    toolName: string;
  }): void {
    this.#transcriptParts = appendOrReplaceTranscriptToolPart(
      this.#transcriptParts,
      toolResultPayloadToAssistantDynamicToolPart({
        args: this.#toolCallArgs.get(payload.toolCallId) ?? {},
        result: payload.result,
        toolCallId: payload.toolCallId,
        toolName: payload.toolName,
        ...(payload.isError ? { isError: true } : {}),
      })
    );
  }

  #ensureTextStarted(out: AGUIEvent[]): void {
    if (this.#textOpen) {
      return;
    }
    if (!this.#messageId) {
      this.#messageId = `msg-${this.#startedToolCalls.size}-${out.length}`;
    }
    this.#textOpen = true;
    out.push({
      type: EventType.TEXT_MESSAGE_START,
      messageId: this.#messageId,
      role: "assistant",
    });
  }

  #endText(out: AGUIEvent[]): void {
    if (this.#textOpen && this.#messageId) {
      out.push({
        type: EventType.TEXT_MESSAGE_END,
        messageId: this.#messageId,
      });
    }
    this.#textOpen = false;
  }

  convert(chunk: DurableChunk): AGUIEvent[] {
    const payload = chunk.payload ?? {};
    const out: AGUIEvent[] = [];

    switch (chunk.type) {
      case "text-start": {
        const id = payload.id;
        if (typeof id === "string" && id) {
          this.#messageId = id;
        }
        this.#ensureTextStarted(out);
        break;
      }
      case "text-delta": {
        this.#ensureTextStarted(out);
        const delta = typeof payload.text === "string" ? payload.text : "";
        out.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta,
          messageId: this.#messageId,
        });
        if (delta) {
          this.#transcriptParts = appendTextDeltaToTranscriptParts(
            this.#transcriptParts,
            delta
          );
        }
        break;
      }
      case "text-end":
        this.#endText(out);
        break;
      case "tool-call":
      case "tool-execution-start": {
        // A tool call interrupts any open text message.
        this.#endText(out);
        const toolCallId = payload.toolCallId;
        // Mastra defaults a missing name to "" rather than omitting it; an
        // empty name would freeze into the replayed transcript as the UI's
        // "Ran tool" placeholder, so fall back to the placeholder explicitly.
        const toolName =
          (typeof payload.toolName === "string"
            ? payload.toolName.trim()
            : "") || "tool";
        if (typeof toolCallId !== "string") {
          break;
        }
        if (this.#startedToolCalls.has(toolCallId)) {
          break;
        }
        this.#startedToolCalls.add(toolCallId);
        this.#toolCallNames.set(toolCallId, toolName);
        const toolInput = payload.args ?? payload.input;
        if (toolInput !== undefined) {
          this.#toolCallArgs.set(toolCallId, toolInput);
        }
        // Persist the call itself, not only its result: a turn that ends before
        // the result (a second suspend, a failure) still has to show WHAT was
        // asked, or the next turn cannot see it happened.
        this.#transcriptParts = appendOrReplaceTranscriptToolPart(
          this.#transcriptParts,
          buildRunningToolPart({
            input: toolInput ?? {},
            toolCallId,
            toolName,
          })
        );
        // A sub-agent delegation (`agent-*`) — its nested progress chunks attach
        // to this tool call until it finalizes.
        if (isSubAgentDelegationToolName(toolName)) {
          this.#activeSubAgentDelegationToolCallId = toolCallId;
        }
        out.push({
          type: EventType.TOOL_CALL_START,
          messageId: this.#messageId || toolCallId,
          toolCallId,
          toolCallName: toolName,
        });
        const input = payload.args ?? payload.input;
        if (input !== undefined) {
          out.push({
            type: EventType.TOOL_CALL_ARGS,
            delta: str(input),
            messageId: this.#messageId || toolCallId,
            toolCallId,
          });
        }
        out.push({
          type: EventType.TOOL_CALL_END,
          messageId: this.#messageId || toolCallId,
          toolCallId,
        });
        break;
      }
      case "tool-result":
      case "tool-output": {
        const toolCallId = payload.toolCallId;
        if (typeof toolCallId !== "string") {
          break;
        }
        const result = payload.result ?? payload.output ?? payload;
        this.#resolvedToolCalls.add(toolCallId);
        if (payload.args !== undefined) {
          this.#toolCallArgs.set(toolCallId, payload.args);
        }
        this.#recordToolResultPart({
          result,
          toolCallId,
          toolName:
            (typeof payload.toolName === "string" ? payload.toolName : "") ||
            this.#toolCallNames.get(toolCallId) ||
            "tool",
        });
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          content: str(result),
          messageId: this.#messageId || toolCallId,
          toolCallId,
        });
        break;
      }
      // Sub-agent delegation streams its inner activity as `agent-execution-event-*`
      // chunks. Map progress/output to the CUSTOM `engenty.sub_agent.progress` event
      // the copilot UI renders as nested lines under the delegation tool card (same
      // event the harness emits). Lifecycle/finalize events carry no line.
      case "agent-execution-event-output":
      case "agent-execution-event-progress": {
        const toolCallId = this.#activeSubAgentDelegationToolCallId;
        if (!toolCallId) {
          break;
        }
        const line = formatSubAgentProgressLine(chunk.type, payload);
        if (line) {
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
              messageId: this.#messageId || toolCallId,
              toolCallId,
            },
          } as AGUIEvent);
        }
        break;
      }
      case "agent-execution-event-cancelled":
      case "agent-execution-event-completed":
      case "agent-execution-event-failed":
        // The delegation tool-result chunk renders the outcome; just stop
        // attaching further progress to this (now finished) delegation.
        this.#activeSubAgentDelegationToolCallId = null;
        break;
      case "tool-call-suspended": {
        // A tool parked the run. Mastra ends the stream right after this chunk
        // and emits no `tool-call` for it, so there is nothing to render here —
        // the caller turns the suspension into an AG-UI interrupt. Close any
        // open text message so the partial answer before the suspend is still
        // well-formed (START → CONTENT* → END).
        this.#endText(out);
        // Parked, not dangling: it must not be answered with an error by
        // `closeUnresolvedToolCalls` — the user is going to answer it.
        if (typeof payload.toolCallId === "string") {
          this.#suspendedToolCalls.add(payload.toolCallId);
        }
        break;
      }
      case "finish":
        // Terminal chunk: token usage for metering and the durable run row.
        if (payload.usage !== undefined) {
          this.#lastUsage = payload.usage;
        }
        break;
      default:
        break;
    }
    return out;
  }

  /**
   * Accumulated sub-agent progress lines keyed by delegation toolCallId. The
   * executor folds these onto the persisted delegation tool part after the run,
   * since Mastra memory drops app-level `progressLines` (the live CUSTOM events
   * only patch the in-flight message, which doesn't survive save/reload).
   */
  getSubAgentProgressLines(): ReadonlyMap<string, string[]> {
    return this.#subAgentProgressLines;
  }

  /** Flush any still-open text message (call once the stream ends). */
  finish(): AGUIEvent[] {
    const out: AGUIEvent[] = [];
    this.#endText(out);
    return out;
  }
}

/**
 * Drive a durable run's `fullStream` to AG-UI, bookended by RUN_STARTED/RUN_FINISHED.
 * `emit` receives each AG-UI event (e.g. our run-event-bus / SSE writer).
 */
export async function streamDurableRunToAgUi(input: {
  emit: (event: AGUIEvent) => void;
  fullStream: ReadableStream<unknown> | AsyncIterable<unknown>;
  runId: string;
  threadId: string;
}): Promise<void> {
  const { emit, runId, threadId } = input;
  const converter = new DurableAgUiConverter();
  emit({ type: EventType.RUN_STARTED, runId, threadId });
  try {
    for await (const chunk of input.fullStream as AsyncIterable<DurableChunk>) {
      for (const event of converter.convert(chunk)) {
        emit(event);
      }
    }
    for (const event of converter.finish()) {
      emit(event);
    }
    emit({ type: EventType.RUN_FINISHED, runId, threadId });
  } catch (error) {
    emit({
      type: EventType.RUN_ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
