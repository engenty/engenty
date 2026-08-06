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
import {
  formatSubAgentProgressLine,
  isSubAgentDelegationToolName,
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
  // Accumulated sub-agent progress lines per delegation toolCallId. The live
  // CUSTOM events only patch the in-flight message; Mastra memory persists the
  // tool part WITHOUT these app-level lines, so the executor folds them back onto
  // the saved part after the run (else the sub-agent card's Log + drill-in are
  // empty on reload). See getSubAgentProgressLines().
  readonly #subAgentProgressLines = new Map<string, string[]>();

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
        out.push({
          type: EventType.TEXT_MESSAGE_CONTENT,
          delta: typeof payload.text === "string" ? payload.text : "",
          messageId: this.#messageId,
        });
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
        out.push({
          type: EventType.TOOL_CALL_RESULT,
          content: str(payload.result ?? payload.output ?? payload),
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
