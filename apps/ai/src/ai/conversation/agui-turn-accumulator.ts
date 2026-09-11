// The durable half of a turn, re-derived from the AG-UI event stream.
//
// `@ag-ui/mastra` emits AG-UI events and nothing else, but the chat lanes depend
// on four facts that never appear on the wire:
//
//   - the assistant turn as durable message PARTS. Mastra memory flushes only at
//     end-of-generation, so a turn ending on an interrupt persists NOTHING — the
//     next turn then reads an empty history and re-asks the question the user
//     already answered, forever.
//   - which tool calls ended the turn UNANSWERED. A hallucinated tool name never
//     dispatches, so no result arrives: the card spins forever and the model
//     re-invents the same tool next turn.
//   - sub-agent progress lines. Mastra memory drops them, so a delegation card's
//     Log and drill-in do not survive a reload without the fold-back.
//   - usage: billed total vs window occupancy.
//
// Deliberately a SINK, not a converter: it emits no events of its own except the
// closing results for dangling calls, so it can sit behind any producer.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import {
  appendOrReplaceTranscriptToolPart,
  appendTextDeltaToTranscriptParts,
  buildRunningToolPart,
  toolResultPayloadToAssistantDynamicToolPart,
} from "../sessions/transcript.js";
import { type RunUsage, usageFromAgUiTokens } from "./run-usage.js";
import { buildUnresolvedToolCallResult } from "./unresolved-tool-call.js";

function str(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value ?? null);
}

/**
 * Args reach us as TEXT and the durable part wants an object.
 *
 * The converters read `payload.args` off the Mastra chunk, already parsed. AG-UI
 * carries only `TOOL_CALL_ARGS` deltas, so the JSON has to be reassembled and
 * parsed here. A call whose args never parse (a truncated stream, a suspend
 * mid-args) keeps the raw text rather than losing the input entirely — replaying a
 * tool call with NO `input` fails the whole turn upstream with "function.arguments
 * must be defined", which poisons the thread for good.
 */
function parseArgsText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export class AgUiTurnAccumulator {
  #transcriptParts: unknown[] = [];
  #messageId = "";
  readonly #startedToolCalls = new Set<string>();
  readonly #resolvedToolCalls = new Set<string>();
  /**
   * Calls that PARKED the run (approval gate, `requestDecision`, a browser tool).
   * Legitimately resultless: the user is going to answer them, so they must never
   * be closed with an error by `closeUnresolvedToolCalls`.
   */
  readonly #suspendedToolCalls = new Set<string>();
  readonly #toolCallNames = new Map<string, string>();
  readonly #toolCallArgsText = new Map<string, string>();
  readonly #subAgentProgressLines = new Map<string, string[]>();
  /** `RUN_FINISHED.usage` — one `TokenUsage` entry per model call. */
  #usageEntries: unknown = null;

  /** The assistant turn so far, as durable message parts. */
  getTranscriptParts(): readonly unknown[] {
    return this.#transcriptParts;
  }

  /** The message id tool cards attach to, for nested progress events. */
  get currentMessageId(): string {
    return this.#messageId;
  }

  /**
   * The model wrote visible text this turn. What separates a truncated-but-
   * usable answer from a run that ended in SILENCE — a `finishReason: "length"`
   * step executes its already-emitted tool calls, ends the loop cleanly, and
   * leaves the user staring at "no response" (see mastra-stream-failure.ts).
   */
  get hasAssistantText(): boolean {
    return this.#transcriptParts.some((part) => {
      const typed = part as { text?: unknown; type?: unknown };
      return (
        typed?.type === "text" &&
        typeof typed.text === "string" &&
        typed.text.trim().length > 0
      );
    });
  }

  /**
   * Every model call summed — what the turn is billed on.
   *
   * Normalized HERE, at the source. Mastra spells usage three different ways
   * depending on where it is read, and normalizing a raw object downstream with
   * the wrong spelling in mind returns an object with every field null — which
   * is how a whole lane billed nothing for months.
   */
  get runUsage(): RunUsage | null {
    return usageFromAgUiTokens(this.#usageEntries);
  }

  /** The LAST model call's input — context-window occupancy, never the sum. Normalized, as above. */
  get windowUsage(): RunUsage | null {
    return usageFromAgUiTokens(this.#usageEntries, { lastOnly: true });
  }

  /** Raw `RUN_FINISHED.usage`, for a caller that meters the entries itself. */
  get usageEntries(): unknown {
    return this.#usageEntries;
  }

  getSubAgentProgressLines(): ReadonlyMap<string, string[]> {
    return this.#subAgentProgressLines;
  }

  /** Record progress emitted by an injected child-run delegation tool. */
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

  /**
   * Mark a call as parked from outside the stream.
   *
   * `MastraAgent` announces a suspension twice — a `CUSTOM on_interrupt` event mid
   * stream and an interrupt on `RUN_FINISHED` — and `observe` below reads both. This
   * exists for a caller that learned about the suspension some other way (the
   * executor already holds the payload) and must not have the call error-closed.
   */
  markSuspended(toolCallId: string): void {
    if (toolCallId) {
      this.#suspendedToolCalls.add(toolCallId);
    }
  }

  /** Feed one AG-UI event. Reads only; never mutates or re-emits the event. */
  observe(event: AGUIEvent): void {
    const e = event as unknown as {
      content?: unknown;
      delta?: unknown;
      messageId?: unknown;
      name?: unknown;
      outcome?: { interrupts?: unknown; type?: unknown };
      parentMessageId?: unknown;
      toolCallId?: unknown;
      toolCallName?: unknown;
      type?: unknown;
      usage?: unknown;
      value?: unknown;
    };
    switch (e.type) {
      case EventType.TEXT_MESSAGE_START:
      case EventType.TEXT_MESSAGE_CHUNK:
      case EventType.TEXT_MESSAGE_CONTENT: {
        // TEXT_MESSAGE_CHUNK is what `@ag-ui/mastra` actually emits; the converters
        // emit START/CONTENT/END. Both are handled so this sits behind either.
        if (typeof e.messageId === "string" && e.messageId) {
          this.#messageId = e.messageId;
        }
        const delta = typeof e.delta === "string" ? e.delta : "";
        if (delta) {
          this.#transcriptParts = appendTextDeltaToTranscriptParts(
            this.#transcriptParts,
            delta
          );
        }
        break;
      }
      case EventType.TOOL_CALL_START: {
        const toolCallId = typeof e.toolCallId === "string" ? e.toolCallId : "";
        if (!toolCallId || this.#startedToolCalls.has(toolCallId)) {
          break;
        }
        // Mastra defaults a missing name to "" rather than omitting it, and an
        // empty name freezes into the replayed transcript as the UI's "Ran tool"
        // placeholder — so fall back to the placeholder explicitly.
        const toolName =
          (typeof e.toolCallName === "string" ? e.toolCallName.trim() : "") ||
          "tool";
        // `@ag-ui/mastra` puts the owning assistant message on `parentMessageId`;
        // our converters put it on `messageId`.
        const parent =
          (typeof e.parentMessageId === "string" ? e.parentMessageId : "") ||
          (typeof e.messageId === "string" ? e.messageId : "");
        if (parent) {
          this.#messageId = parent;
        }
        this.#startedToolCalls.add(toolCallId);
        this.#toolCallNames.set(toolCallId, toolName);
        // Persist the CALL, not only its result: a turn that ends before the
        // result (a suspend, a failure) still has to show what was asked.
        this.#transcriptParts = appendOrReplaceTranscriptToolPart(
          this.#transcriptParts,
          buildRunningToolPart({ input: {}, toolCallId, toolName })
        );
        break;
      }
      case EventType.TOOL_CALL_ARGS: {
        const toolCallId = typeof e.toolCallId === "string" ? e.toolCallId : "";
        const delta = typeof e.delta === "string" ? e.delta : "";
        if (!(toolCallId && delta)) {
          break;
        }
        const text = (this.#toolCallArgsText.get(toolCallId) ?? "") + delta;
        this.#toolCallArgsText.set(toolCallId, text);
        // Rewrite the running part each time so a turn that dies mid-args still
        // persists the partial input rather than an empty object.
        this.#transcriptParts = appendOrReplaceTranscriptToolPart(
          this.#transcriptParts,
          buildRunningToolPart({
            input: parseArgsText(text),
            toolCallId,
            toolName: this.#toolCallNames.get(toolCallId) ?? "tool",
          })
        );
        break;
      }
      case EventType.TOOL_CALL_RESULT: {
        const toolCallId = typeof e.toolCallId === "string" ? e.toolCallId : "";
        if (!toolCallId) {
          break;
        }
        this.#resolvedToolCalls.add(toolCallId);
        // AG-UI carries the result as a STRING; the durable part wants the value.
        const raw = e.content;
        let result: unknown = raw;
        if (typeof raw === "string") {
          try {
            result = JSON.parse(raw);
          } catch {
            result = raw;
          }
        }
        this.#recordToolResultPart({ result, toolCallId });
        break;
      }
      case EventType.CUSTOM: {
        if (e.name === "engenty.sub_agent.progress") {
          const value = e.value as
            | { line?: unknown; toolCallId?: unknown }
            | undefined;
          if (
            typeof value?.toolCallId === "string" &&
            typeof value.line === "string"
          ) {
            this.recordSubAgentProgress(value.toolCallId, value.line);
          }
          break;
        }
        if (e.name === "on_interrupt") {
          // `@ag-ui/mastra`'s mid-stream suspension announcement — a JSON string
          // carrying the whole Mastra suspend payload.
          const parsed = readOnInterrupt(e.value);
          if (parsed) {
            this.markSuspended(parsed.toolCallId);
          }
        }
        break;
      }
      case EventType.RUN_FINISHED: {
        if (Array.isArray(e.usage)) {
          this.#usageEntries = e.usage;
        }
        if (e.outcome?.type === "interrupt") {
          for (const interrupt of readInterrupts(e.outcome.interrupts)) {
            this.markSuspended(interrupt.toolCallId);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /** Calls that were started, never answered, and are not parked. */
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
   * durable transcript. Without it the card spins forever in the live window and
   * the model never learns the call failed, so it re-invents the same tool next
   * turn. Call once, after the stream ends.
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
      this.#recordToolResultPart({ isError: true, result, toolCallId });
      out.push({
        content: str(result),
        messageId: this.#messageId || toolCallId,
        toolCallId,
        type: EventType.TOOL_CALL_RESULT,
      } as AGUIEvent);
    }
    return out;
  }

  #recordToolResultPart(payload: {
    isError?: boolean;
    result: unknown;
    toolCallId: string;
  }): void {
    const argsText = this.#toolCallArgsText.get(payload.toolCallId) ?? "";
    this.#transcriptParts = appendOrReplaceTranscriptToolPart(
      this.#transcriptParts,
      toolResultPayloadToAssistantDynamicToolPart({
        args: parseArgsText(argsText),
        result: payload.result,
        toolCallId: payload.toolCallId,
        toolName: this.#toolCallNames.get(payload.toolCallId) ?? "tool",
        ...(payload.isError ? { isError: true } : {}),
      })
    );
  }
}

/** The `on_interrupt` CUSTOM payload, which rides as a JSON string. */
function readOnInterrupt(value: unknown): { toolCallId: string } | null {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const toolCallId = (parsed as { toolCallId?: unknown })?.toolCallId;
  return typeof toolCallId === "string" && toolCallId ? { toolCallId } : null;
}

/** `RUN_FINISHED.outcome.interrupts`, narrowed to the ids we care about. */
function readInterrupts(value: unknown): { toolCallId: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: { toolCallId: string }[] = [];
  for (const raw of value) {
    const toolCallId = (raw as { toolCallId?: unknown })?.toolCallId;
    if (typeof toolCallId === "string" && toolCallId) {
      out.push({ toolCallId });
    }
  }
  return out;
}
