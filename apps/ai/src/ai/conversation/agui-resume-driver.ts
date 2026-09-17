// The resume lane: continue a suspended run from Mastra's durable snapshot.
//
// `MastraAgent` splits an interrupt id `${runId}::${toolCallId}` apart and calls
// `agent.resumeStream(resumeData, { toolCallId, runId, memory })`. No in-memory
// session is involved — the snapshot is the whole state.
//
// Three things this boundary has to handle, none of which upstream exposes a
// config for. All are answered here or in `interceptMastraStream` (a proxy over
// OUR OWN agent), never by reaching into `@ag-ui/mastra`'s private members:
//
//   - `resumeStream` is called with `{toolCallId, runId, memory, requestContext}`
//     and nothing else. The configured `untilIdle` is not read on this branch, so
//     the interceptor puts it back; without it the stream closes before a
//     background-task continuation can finish.
//   - A stream can end with `finishReason: "error"` without ever throwing — a
//     gateway `context_length_exceeded` is the common one. That must not be
//     written to history as success, because doing so also CLEARS the open
//     interrupt and the user loses the pending approval.
//   - `MastraAgent` emits a STATE_SNAPSHOT of Mastra working memory before every
//     RUN_FINISHED. Our client reads STATE_SNAPSHOT as the app-shell UI state
//     (`useSyncAgentUiRunState`), which is carried on
//     `forwardedProps.engenty.ui_state` instead — see `agent-ui-state.ts`. Letting
//     the working-memory snapshot through would clobber it, so it is filtered.
//
// Frontend tools are declared on the assembled agent rather than passed per
// resume as `clientTools`, which is also where the start lane declares them.
import { type AGUIEvent, EventType } from "@engenty/ag-ui-bridge";
import { contextPromptTokensFromOutput } from "../sessions/usage.js";
import { AgUiTextChunkExpander } from "./agui-text-chunks.js";
import type { AgUiTurnAccumulator } from "./agui-turn-accumulator.js";
import { interceptMastraStream } from "./mastra-stream-intercept.js";

/** A tool that parked the run again inside the continuation. */
export interface AgUiSuspendedAgain {
  args: unknown;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

export interface AgUiResumeOutcome {
  /** In-band failure. A failed resume must never be reported as completed. */
  streamError: string | null;
  /** The continuation parked again — another approval, or a browser tool. */
  suspendedAgain?: AgUiSuspendedAgain;
  /** The LAST model call's input tokens — see AgUiStartOutcome for why the
   * stream's own steps are the only true source. */
  windowInputTokens?: number | null;
}

/**
 * The Mastra suspension `@ag-ui/mastra` preserves under `metadata.mastra`.
 *
 * An AG-UI `Interrupt` has no field for a tool's name, its args, or the payload
 * the gate suspended with — and this lane needs all three to render the next
 * card. Upstream keeps them here, shaped like the legacy `on_interrupt` value.
 */
function suspendedAgainFromInterrupt(
  interrupt: unknown
): AgUiSuspendedAgain | undefined {
  const metadata = (interrupt as { metadata?: { mastra?: unknown } })?.metadata
    ?.mastra as
    | {
        args?: unknown;
        suspendPayload?: unknown;
        toolName?: unknown;
        type?: unknown;
      }
    | undefined;
  if (metadata?.type !== "mastra_suspend") {
    return;
  }
  const toolCallId = (interrupt as { toolCallId?: unknown }).toolCallId;
  if (typeof toolCallId !== "string" || !toolCallId) {
    return;
  }
  return {
    args: metadata.args,
    suspendPayload: metadata.suspendPayload,
    toolCallId,
    toolName: typeof metadata.toolName === "string" ? metadata.toolName : "",
  };
}

/**
 * Events the caller frames itself, or must never see.
 *
 * RUN_STARTED/RUN_FINISHED: `resume-conversation-run` brackets the resume with
 * its OWN pair carrying `newRunId` — the POST's run id, which is what the client
 * attached to. Letting MastraAgent's pair through as well writes the frame TWICE
 * into `ai.agent_run_event`, which a spec-compliant AG-UI client rejects outright
 * and which replays as a run that starts twice. Exactly the bug the headless
 * caller already framed the run.
 *
 * STATE_SNAPSHOT: the working-memory snapshot filtered at the top of this file.
 */
function isCallerFramedEvent(type: unknown): boolean {
  return (
    type === EventType.RUN_STARTED ||
    type === EventType.RUN_FINISHED ||
    type === EventType.STATE_SNAPSHOT
  );
}

/**
 * Continue a suspended run from Mastra's snapshot and stream it as AG-UI.
 *
 * Every event reaches the accumulator — it needs RUN_FINISHED for usage and for
 * the interrupt outcome — while the caller-framed ones are held back from the
 * wire.
 */
export async function resumeViaMastraAgent(params: {
  accumulator: AgUiTurnAccumulator;
  agent: unknown;
  agentId: string;
  emit: (event: AGUIEvent) => void;
  /** Reasoning-iteration cap — rides the intercept into `agent.resumeStream()`. */
  maxSteps?: number;
  /** The POST's run id, which frames the events the client sees. */
  newRunId: string;
  requestContext?: unknown;
  resourceId: string;
  resumeData: unknown;
  /** The run the snapshot belongs to — NOT `newRunId`. */
  suspendedRunId: string;
  threadId: string;
  toolCallId: string;
}): Promise<AgUiResumeOutcome> {
  const { MastraAgent } = await import("@ag-ui/mastra");
  const { formatAgentStreamFailureMessage, readMastraStreamFailure } =
    await import("../sessions/mastra-stream-failure.js");
  const outcome: AgUiResumeOutcome = { streamError: null };
  // `@ag-ui/mastra` emits TEXT_MESSAGE_CHUNK; this wire is defined on the
  // expanded form — see agui-text-chunks.ts for the three reasons.
  const text = new AgUiTextChunkExpander();
  const { proxied, readErrorChunk, readStream, readTripwireChunk } =
    interceptMastraStream(params.agent, "resumeStream", {
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
      untilIdle: true,
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

  const onEvent = (event: Record<string, unknown>) => {
    params.accumulator.observe(event as never);
    if (event.type === EventType.RUN_FINISHED) {
      const interrupts = (event as { outcome?: { interrupts?: unknown } })
        .outcome?.interrupts;
      if (Array.isArray(interrupts)) {
        for (const interrupt of interrupts) {
          const again = suspendedAgainFromInterrupt(interrupt);
          if (again) {
            outcome.suspendedAgain = again;
          }
        }
      }
    }
    if (event.type === EventType.RUN_ERROR) {
      outcome.streamError ??=
        typeof (event as { message?: unknown }).message === "string"
          ? (event as { message: string }).message
          : "agent stream error";
    }
    if (isCallerFramedEvent(event.type)) {
      return;
    }
    for (const expanded of text.expand(event as never as AGUIEvent)) {
      params.emit(expanded);
    }
  };

  try {
    // `run()`, not `runAgent()`.
    //
    // `runAgent` puts the stream through AG-UI's client pipeline, which expands
    // `TEXT_MESSAGE_CHUNK` into START/CONTENT/END — and BUFFERS while doing it.
    // A stream that dies mid-text delivered only the START: the partial answer
    // never reached the subscriber, so the transcript safety net wrote nothing
    // for exactly the failure it exists to rescue. (It also cost ~3s per run in
    // retries.) Subscribing to the raw Observable keeps every event, in order,
    // as `MastraAgent` produced it; the accumulator already reads CHUNK and
    // START/CONTENT alike.
    await new Promise<void>((resolve, reject) => {
      agUiAgent
        .run({
          context: [],
          forwardedProps: {},
          messages: [],
          // The canonical AG-UI resume. `MastraAgent` splits this id back into
          // the suspended run and its tool call, which is why the SUSPENDED run
          // id goes here and `newRunId` only frames the wire.
          resume: [
            {
              interruptId: `${params.suspendedRunId}::${params.toolCallId}`,
              payload: params.resumeData,
              status: "resolved",
            },
          ],
          runId: params.newRunId,
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
    // A stream failure is a FAILED resume, not a thrown call — the caller turns
    // `streamError` into the run's outcome and leaves the interrupt in place.
    outcome.streamError ??=
      error instanceof Error ? error.message : String(error);
  }

  // Mastra can END a stream with `finishReason: "error"` and never
  // throw — gateway `context_length_exceeded` is the common one — which reads as
  // a clean finish from the events alone. Reporting that as a completed resume
  // writes a success into history and CLEARS the open interrupt, deleting the
  // only pointer back to a turn that never produced an answer.
  // Close any text message still open — on EVERY exit path, including a failed
  // one, so the partial answer before the failure is still well-formed.
  for (const closing of text.finish()) {
    params.emit(closing);
  }

  // Prefer the message off the raw chunk. Upstream's RUN_ERROR for
  // an object-shaped error says "[object Object]", which tells nobody anything.
  const rawError = readErrorChunk();
  if (rawError) {
    outcome.streamError = formatAgentStreamFailureMessage(rawError);
  }
  if (!outcome.streamError) {
    const failure = await readMastraStreamFailure(readStream(), {
      hasAssistantText: params.accumulator.hasAssistantText,
      tripwire: readTripwireChunk(),
    });
    if (failure) {
      outcome.streamError = failure.message;
    }
  }
  // Window occupancy from the stream's own last step — see AgUiStartOutcome.
  try {
    const s = readStream() as { getFullOutput?: () => Promise<unknown> };
    outcome.windowInputTokens = await contextPromptTokensFromOutput(
      await s.getFullOutput?.()
    );
  } catch {
    outcome.windowInputTokens = null;
  }

  return outcome;
}
