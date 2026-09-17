// The start lane: a fresh interactive turn, driven by `@ag-ui/mastra`.
//
// A person is watching this lane, which is why it owns an AbortController and
// four concerns the headless and resume lanes never meet. Each is answered
// through `interceptMastraStream` (a proxy over OUR OWN agent) rather than by
// reaching into `MastraAgent`'s private members.
//
//   - CANCELLATION. `MastraAgent` builds its `agent.stream()` options as
//     `{memory, runId, clientTools, requestContext}` with no `abortSignal`, and
//     its Observable teardown is a bare `() => {}` — unsubscribing does not stop
//     the underlying stream. A local Mastra agent driven by stock `MastraAgent`
//     cannot be cancelled at all, so the Stop button depends on the controller
//     this driver owns.
//   - STOPPING ON A TOOL RESULT. `requestFeedback` returns its artifact as a tool
//     RESULT instead of suspending (`requestDecision` suspends — see
//     native-request-decision.ts). The model would talk straight past it, so the
//     run is aborted from inside the event stream, through that same controller.
//   - THE RESUME CORRELATION KEY. A resume needs the MASTRA run id its snapshot
//     is filed under. It arrives inside the interrupt id, which upstream builds
//     as `${runId}::${toolCallId}` from the suspend chunk's own `runId`. The
//     `?? input.runId` fallback in `suspendToInterrupt` is asserted, not assumed:
//     if that field ever goes missing the id silently becomes OUR run id and
//     every resume dead-ends in "no snapshot".
//   - ATTACHMENTS. AG-UI's message content would force a PDF through
//     `{type:"image"}`, so attachments are placed where Mastra already expects
//     them — see `interceptMastraStream`.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import { contextPromptTokensFromOutput } from "../sessions/usage.js";
import { AgUiTextChunkExpander } from "./agui-text-chunks.js";
import type { AgUiTurnAccumulator } from "./agui-turn-accumulator.js";
import {
  interceptMastraStream,
  type MastraStreamAttachment,
} from "./mastra-stream-intercept.js";

/** A tool that parked the turn, with everything the interrupt needs to render. */
export interface AgUiStartSuspension {
  args: unknown;
  /**
   * The MASTRA run id the suspension belongs to — NOT this executor's run id.
   * The resume POST looks the snapshot up by it.
   */
  mastraRunId: string;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

export interface AgUiStartOutcome {
  /** A `requestFeedback` artifact that stopped the run. */
  artifact?: { result: unknown; toolCallId: string };
  runError: string | null;
  suspended?: AgUiStartSuspension;
  /**
   * The LAST model call's input tokens — context-window occupancy. Read off
   * the Mastra stream's own steps: `RUN_FINISHED.usage` arrives as ONE
   * aggregated entry, so any "last entry" read there is the run SUM, which is
   * how every run row over-reported its context by the number of steps.
   */
  windowInputTokens?: number | null;
}

/**
 * Everything the resume round-trip needs, read off one AG-UI interrupt.
 *
 * An AG-UI `Interrupt` has no field for a tool's name, its args, or the payload
 * the gate suspended with. Upstream keeps them under `metadata.mastra`, shaped
 * like its legacy `on_interrupt` value.
 */
function suspensionFromInterrupt(
  interrupt: unknown
): AgUiStartSuspension | undefined {
  const record = interrupt as
    | { id?: unknown; metadata?: { mastra?: unknown }; toolCallId?: unknown }
    | undefined;
  const metadata = record?.metadata?.mastra as
    | {
        args?: unknown;
        runId?: unknown;
        suspendPayload?: unknown;
        toolName?: unknown;
        type?: unknown;
      }
    | undefined;
  if (metadata?.type !== "mastra_suspend") {
    return;
  }
  const toolCallId =
    typeof record?.toolCallId === "string" ? record.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  // Prefer `metadata.mastra.runId`; fall back to the id's own prefix, which is
  // where upstream put it (`${runId}::${toolCallId}`).
  const idPrefix =
    typeof record?.id === "string" && record.id.includes("::")
      ? record.id.slice(0, record.id.indexOf("::"))
      : "";
  return {
    args: metadata.args,
    mastraRunId:
      (typeof metadata.runId === "string" ? metadata.runId : "") || idPrefix,
    suspendPayload: metadata.suspendPayload,
    toolCallId,
    toolName: typeof metadata.toolName === "string" ? metadata.toolName : "",
  };
}

/**
 * Events the caller frames itself, or must never see.
 *
 * RUN_STARTED/RUN_FINISHED: `conversation-run` brackets the turn with its own
 * pair, and letting both through writes the frame twice into
 * `ai.agent_run_event`, which a spec-compliant AG-UI client rejects outright.
 *
 * TODO: drop OUR frame and keep upstream's, so this filter can go. Upstream's is
 * not inadequate — `makeRunFinishedEvent` carries both
 * `outcome:{type:"interrupt",interrupts}` (when `emitInterruptOutcome` is on, as
 * it is by default) and `usage`. Three things block the swap: our run identity is
 * assigned before the stream opens, some paths must emit a frame without ever
 * starting a stream, and the stop-on-artifact abort finishes a run upstream never
 * gets to close.
 *
 * STATE_SNAPSHOT: upstream emits Mastra WORKING MEMORY on that channel before
 * every RUN_FINISHED, with no config to disable it, and our client reads
 * STATE_SNAPSHOT as the app-shell UI snapshot, which rides on
 * `forwardedProps.engenty.ui_state` instead (see `agent-ui-state.ts`).
 */
function isCallerFramedEvent(type: unknown): boolean {
  return (
    type === EventType.RUN_STARTED ||
    type === EventType.RUN_FINISHED ||
    type === EventType.STATE_SNAPSHOT
  );
}

/**
 * Drive one interactive turn and stream it as AG-UI.
 *
 * Every event reaches the accumulator — it needs RUN_FINISHED for usage and the
 * interrupt outcome — while the caller-framed ones are held back from the wire.
 */
export async function runInteractiveViaMastraAgent(params: {
  abortSignal?: AbortSignal;
  accumulator: AgUiTurnAccumulator;
  agent: unknown;
  agentId: string;
  attachments?: readonly MastraStreamAttachment[];
  emit: (event: AGUIEvent) => void;
  /** Recognises the tool result that must stop the run. */
  isStopOnResult: (result: unknown) => boolean;
  /** Reasoning-iteration cap — rides the intercept into `agent.stream()`. */
  maxSteps?: number;
  prompt: string;
  requestContext?: unknown;
  resourceId: string;
  runId: string;
  threadId: string;
}): Promise<AgUiStartOutcome> {
  const { MastraAgent } = await import("@ag-ui/mastra");
  const { formatAgentStreamFailureMessage, readMastraStreamFailure } =
    await import("../sessions/mastra-stream-failure.js");
  const outcome: AgUiStartOutcome = { runError: null };

  // One controller serves both: the route's Stop and our own
  // "a tool returned something the model must not talk past".
  const cancel = new AbortController();
  const onExternalAbort = () => cancel.abort();
  if (params.abortSignal?.aborted) {
    cancel.abort();
  } else {
    params.abortSignal?.addEventListener("abort", onExternalAbort, {
      once: true,
    });
  }

  const { proxied, readErrorChunk, readStream, readTripwireChunk } =
    interceptMastraStream(params.agent, "stream", {
      abortSignal: cancel.signal,
      ...(params.attachments?.length
        ? { attachments: params.attachments }
        : {}),
      ...(params.maxSteps ? { maxSteps: params.maxSteps } : {}),
      onSubAgentProgress: (toolCallId, line) => {
        params.accumulator.recordSubAgentProgress(toolCallId, line);
        params.emit({
          name: "engenty.sub_agent.progress",
          type: EventType.CUSTOM,
          value: {
            line,
            messageId: params.accumulator.currentMessageId || toolCallId,
            toolCallId,
          },
        } as AGUIEvent);
      },
    });

  const agUiAgent = new (
    MastraAgent as never as new (
      c: unknown
    ) => {
      run: (input: unknown) => {
        subscribe: (observer: {
          complete: () => void;
          error: (e: unknown) => void;
          next: (event: Record<string, unknown>) => void;
        }) => void;
      };
    }
  )({
    agent: proxied,
    agentId: params.agentId,
    resourceId: params.resourceId,
    threadId: params.threadId,
    ...(params.requestContext ? { requestContext: params.requestContext } : {}),
  });

  // `@ag-ui/mastra` emits TEXT_MESSAGE_CHUNK; this wire is defined on the
  // expanded form — see agui-text-chunks.ts for the three reasons.
  const text = new AgUiTextChunkExpander();
  const onEvent = (event: Record<string, unknown>) => {
    params.accumulator.observe(event as never);
    if (event.type === EventType.RUN_FINISHED) {
      const interrupts = (event as { outcome?: { interrupts?: unknown } })
        .outcome?.interrupts;
      if (Array.isArray(interrupts)) {
        for (const interrupt of interrupts) {
          const suspended = suspensionFromInterrupt(interrupt);
          if (suspended) {
            outcome.suspended = suspended;
          }
        }
      }
    }
    if (event.type === EventType.RUN_ERROR) {
      outcome.runError ??=
        typeof (event as { message?: unknown }).message === "string"
          ? (event as { message: string }).message
          : "agent stream error";
    }
    if (event.type === EventType.TOOL_CALL_RESULT && !outcome.artifact) {
      // The result arrives as a JSON STRING on the wire.
      const raw = (event as { content?: unknown }).content;
      let result: unknown = raw;
      if (typeof raw === "string") {
        try {
          result = JSON.parse(raw);
        } catch {
          result = raw;
        }
      }
      if (params.isStopOnResult(result)) {
        outcome.artifact = {
          result,
          toolCallId: String(
            (event as { toolCallId?: unknown }).toolCallId ?? ""
          ),
        };
        // Stop the run so the model does not answer past the interrupt, and
        // do NOT forward this result — the caller emits the interactive
        // interrupt instead of a plain tool result. The durable part is already
        // recorded by the accumulator above, so the next turn can still see what
        // was asked.
        cancel.abort();
        return;
      }
    }
    if (isCallerFramedEvent(event.type)) {
      return;
    }
    for (const expanded of text.expand(event as never as AGUIEvent)) {
      params.emit(expanded);
    }
  };

  try {
    // `run()`, not `runAgent()`: the client pipeline BUFFERS its text-chunk
    // expansion, so a turn that dies mid-text delivers only the START and drops
    // the words — for exactly the failure the transcript safety net rescues.
    await new Promise<void>((resolve, reject) => {
      agUiAgent
        .run({
          context: [],
          forwardedProps: {},
          messages: [
            {
              content: params.prompt,
              id: `${params.runId}-user`,
              role: "user",
            },
          ],
          runId: params.runId,
          state: {},
          threadId: params.threadId,
          tools: [],
        })
        .subscribe({
          complete: () => resolve(),
          error: (error: unknown) => reject(error),
          next: onEvent,
        });
    });
  } catch (error) {
    outcome.runError ??= error instanceof Error ? error.message : String(error);
  } finally {
    params.abortSignal?.removeEventListener("abort", onExternalAbort);
  }

  // Close any text message still open, on EVERY exit path, so a partial answer
  // before a suspend or a failure is still well-formed START → CONTENT → END.
  for (const closing of text.finish()) {
    params.emit(closing);
  }

  // Prefer the raw chunk's message: upstream's RUN_ERROR for an object-shaped
  // error says "[object Object]", which tells nobody anything.
  const rawError = readErrorChunk();
  if (rawError) {
    // Named where the harness knows the shape (timeout budget, provider
    // moderation, context overflow); every other message passes as-is.
    outcome.runError = formatAgentStreamFailureMessage(rawError);
  }
  if (!outcome.runError) {
    const failure = await readMastraStreamFailure(readStream(), {
      hasAssistantText: params.accumulator.hasAssistantText,
      tripwire: readTripwireChunk(),
    });
    if (failure) {
      outcome.runError = failure.message;
    }
  }
  // Window occupancy comes from the stream's own last step — see the outcome
  // field's doc for why the AG-UI usage entries cannot supply it.
  try {
    const s = readStream() as { getFullOutput?: () => Promise<unknown> };
    outcome.windowInputTokens = await contextPromptTokensFromOutput(
      await s.getFullOutput?.()
    );
  } catch {
    outcome.windowInputTokens = null;
  }
  // A run we stopped ourselves, or the user stopped, is not a failure.
  if (
    cancel.signal.aborted &&
    (outcome.artifact || params.abortSignal?.aborted)
  ) {
    outcome.runError = null;
  }

  return outcome;
}
