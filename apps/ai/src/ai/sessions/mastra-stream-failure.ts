// Mastra can finish a stream with finishReason "error" (e.g. gateway
// context_length_exceeded) without throwing — the harness must inspect output.
//
// It can also finish CLEANLY with nothing to show: a "length" cut-off, a
// provider content filter, a guardrail tripwire, the step cap landing on a
// step that still wanted tools, or a model that simply stopped without text.
// Each of those is named here so the person sees WHY the turn stopped instead
// of a silent "no response".

import { isRunTimeoutError } from "./run-guards.js";

const CONTEXT_LENGTH_EXCEEDED_CODE = "context_length_exceeded";

export const AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED =
  "agent_threads.contextLengthExceeded" as const;

export function isContextLengthExceededError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes(CONTEXT_LENGTH_EXCEEDED_CODE) ||
      message.includes("context window") ||
      message.includes("context length")
    );
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (record.code === CONTEXT_LENGTH_EXCEEDED_CODE) {
      return true;
    }
    if (typeof record.message === "string") {
      const message = record.message.toLowerCase();
      return (
        message.includes(CONTEXT_LENGTH_EXCEEDED_CODE) ||
        message.includes("context window") ||
        message.includes("context length")
      );
    }
  }
  return false;
}

/**
 * Provider-side moderation delivered as an API error rather than a
 * `content-filter` finish. DeepSeek/DashScope report it as
 * `InternalError.Algo.DataInspectionFailed` (code `data_inspection_failed`),
 * wrapped by the AI SDK in an `AI_TypeValidationError` whose message is the
 * whole response JSON — so the code is matched inside the message text.
 */
export function isProviderContentFilterError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const record = error as { code?: unknown; message?: unknown };
  if (record.code === "data_inspection_failed") {
    return true;
  }
  const message =
    typeof error === "string"
      ? error
      : typeof record.message === "string"
        ? record.message
        : "";
  const lower = message.toLowerCase();
  return (
    lower.includes("data_inspection_failed") ||
    lower.includes("datainspectionfailed") ||
    lower.includes("content_filter") ||
    lower.includes("content_policy_violation")
  );
}

export function formatAgentStreamFailureMessage(error: unknown): string {
  if (isContextLengthExceededError(error)) {
    return AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED;
  }
  if (isRunTimeoutError(error)) {
    return AGENT_THREADS_RUN_TIMED_OUT;
  }
  if (isProviderContentFilterError(error)) {
    return AGENT_THREADS_CONTENT_FILTERED;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "agent_threads.runFailed";
}

export const AGENT_THREADS_OUTPUT_TRUNCATED =
  "agent_threads.outputTruncated" as const;

export const AGENT_THREADS_CONTENT_FILTERED =
  "agent_threads.contentFiltered" as const;

/** A `modelSettings.timeout` budget (step or whole run) ran out. */
export const AGENT_THREADS_RUN_TIMED_OUT = "agent_threads.runTimedOut" as const;

/** The step cap ended the loop on a step that still wanted tool calls. */
export const AGENT_THREADS_STEP_LIMIT_REACHED =
  "agent_threads.stepLimitReached" as const;

/** The model stopped cleanly and wrote nothing, even after the nudge. */
export const AGENT_THREADS_EMPTY_REPLY = "agent_threads.emptyReply" as const;

/** A processor tripwire (guardrail block) ended the run before any reply. */
export const AGENT_THREADS_GUARDRAIL_TRIPPED =
  "agent_threads.guardrailTripped" as const;

/** The durable run row's error_code for a named stream failure. */
export function agentRunErrorCode(failureMessage: string): string {
  switch (failureMessage) {
    case AGENT_THREADS_OUTPUT_TRUNCATED:
    case AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED:
      return "context_window_exceeded";
    case AGENT_THREADS_CONTENT_FILTERED:
      return "content_filtered";
    case AGENT_THREADS_RUN_TIMED_OUT:
      return "run_timeout";
    case AGENT_THREADS_STEP_LIMIT_REACHED:
      return "step_limit";
    case AGENT_THREADS_EMPTY_REPLY:
      return "empty_reply";
    case AGENT_THREADS_GUARDRAIL_TRIPPED:
      return "tripwire";
    default:
      return "run_error";
  }
}

interface MastraStreamOutput {
  finishReason?: string;
  getFullOutput?: () => Promise<{
    error?: Error;
    finishReason?: string;
    tripwire?: { processorId?: string; reason?: string } | boolean;
  }>;
}

/** The `tripwire` chunk Mastra emits when a processor blocks the run. */
export interface MastraTripwireInfo {
  processorId?: string;
  reason?: string;
}

export async function readMastraStreamFailure(
  output: unknown,
  options?: {
    /**
     * The model wrote visible text this turn. A "length"/"content-filter" stop
     * is then a cut-off answer the user can already see, not a silent run —
     * failing it would mark a turn with a usable partial reply as failed.
     */
    hasAssistantText?: boolean;
    /** The tripwire chunk read off the stream, when one passed by. */
    tripwire?: MastraTripwireInfo | null;
  }
): Promise<Error | null> {
  if (!output || typeof output !== "object") {
    return null;
  }
  const stream = output as MastraStreamOutput;
  let finishReason = stream.finishReason;
  let error: unknown;
  let tripwire: MastraTripwireInfo | null = options?.tripwire ?? null;
  if (typeof stream.getFullOutput === "function") {
    try {
      const full = await stream.getFullOutput();
      finishReason = full.finishReason ?? finishReason;
      error = full.error;
      if (!tripwire && full.tripwire) {
        tripwire =
          typeof full.tripwire === "object" ? full.tripwire : { reason: "" };
      }
    } catch {
      // Prefer explicit stream failure below when getFullOutput is unavailable.
    }
  }
  if (finishReason === "error" || error) {
    return new Error(formatAgentStreamFailureMessage(error));
  }
  // A tripwire ends the loop before the reply. The token limiter's is a
  // context problem (its system prompt alone exceeds the budget); every other
  // processor's is a guardrail decision.
  if (finishReason === "tripwire" || tripwire) {
    if (options?.hasAssistantText) {
      return null;
    }
    return new Error(
      tripwire?.processorId === "token-limiter"
        ? AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED
        : AGENT_THREADS_GUARDRAIL_TRIPPED
    );
  }
  // "length" and "content-filter" end the agent loop mid-turn without an error:
  // Mastra executes the step's already-emitted tool calls and stops, so the run
  // reports completed with no final text — a silence indistinguishable from
  // success. Name them so the person sees WHY the turn stopped.
  if (!options?.hasAssistantText) {
    if (finishReason === "length") {
      return new Error(AGENT_THREADS_OUTPUT_TRUNCATED);
    }
    if (finishReason === "content-filter") {
      return new Error(AGENT_THREADS_CONTENT_FILTERED);
    }
    // The step cap (`maxSteps`) stopped the loop while the last step still
    // wanted tools: Mastra ran those calls and ended — no reply.
    if (finishReason === "tool-calls") {
      return new Error(AGENT_THREADS_STEP_LIMIT_REACHED);
    }
    // The model stopped on its own with nothing to show. The empty-reply
    // completion scorer already gave it one more step before this is reached.
    if (finishReason === "stop") {
      return new Error(AGENT_THREADS_EMPTY_REPLY);
    }
  }
  return null;
}
