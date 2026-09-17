// Run guards every agent lane shares: a time budget on the model calls and a
// one-shot nudge when the model ends its turn without saying anything.
//
// Both ride Mastra's own execution options (`modelSettings.timeout`,
// `isTaskComplete`) so start, resume, delegate and the non-streaming generate
// path get the same behavior from one place.
//
// Why these two:
//   - A provider stream that never finishes left the run `running` until the
//     process restarted (then `executor_lost`). Mastra's `timeout.stepMs` caps
//     one model call, `totalMs` the whole run; either fails the run with a
//     `MastraTimeoutError` the harness names (`agent_threads.runTimedOut`).
//   - A medium-tier model regularly ends a tool-heavy turn with
//     `finishReason: "stop"` and no text. Mastra treats that as a clean finish,
//     so the run completed and the chat showed "no response". The completion
//     scorer below fails that step once, which makes Mastra append its
//     completion feedback and run one more step; the second silence is then
//     named (`agent_threads.emptyReply`) instead of passed as success.

import type { IsTaskCompleteConfig } from "@mastra/core/agent";

type CompletionScorer = NonNullable<IsTaskCompleteConfig["scorers"]>[number];

/** Env: cap on ONE model call. `0` disables. */
export const ENGENTY_AI_STEP_TIMEOUT_MS_ENV = "ENGENTY_AI_STEP_TIMEOUT_MS";
/** Env: cap on the WHOLE run (every step, tool call and retry). `0` disables. */
export const ENGENTY_AI_RUN_TIMEOUT_MS_ENV = "ENGENTY_AI_RUN_TIMEOUT_MS";

/**
 * 3 minutes per model call. A 300k-token prompt on a flash-tier model needs
 * well over a minute of prefill before the first token, so a tighter default
 * would fail long chats that are still making progress.
 */
export const DEFAULT_STEP_TIMEOUT_MS = 180_000;
/** 20 minutes per run: 24 steps of a slow model plus sandboxed tool calls. */
export const DEFAULT_RUN_TIMEOUT_MS = 1_200_000;

export interface RunTimeouts {
  stepMs?: number;
  totalMs?: number;
}

function parseTimeoutEnv(raw: string | undefined, fallback: number): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

/**
 * The run's time budget from the environment. A key set to `0` switches that
 * cap off; absent or unparsable falls back to the default.
 */
export function resolveRunTimeouts(
  env: NodeJS.ProcessEnv = process.env
): RunTimeouts {
  const stepMs = parseTimeoutEnv(
    env[ENGENTY_AI_STEP_TIMEOUT_MS_ENV],
    DEFAULT_STEP_TIMEOUT_MS
  );
  const totalMs = parseTimeoutEnv(
    env[ENGENTY_AI_RUN_TIMEOUT_MS_ENV],
    DEFAULT_RUN_TIMEOUT_MS
  );
  return {
    ...(stepMs > 0 ? { stepMs } : {}),
    ...(totalMs > 0 ? { totalMs } : {}),
  };
}

/**
 * Merge the time budget into whatever `modelSettings` the caller already has.
 * Caller-set `timeout` fields win; unset ones take the env-resolved budget.
 */
export function withRunTimeouts<T extends Record<string, unknown> | undefined>(
  modelSettings: T,
  timeouts: RunTimeouts = resolveRunTimeouts()
): Record<string, unknown> | undefined {
  if (!(timeouts.stepMs || timeouts.totalMs)) {
    return modelSettings;
  }
  const existing = (modelSettings ?? {}) as Record<string, unknown>;
  const existingTimeout = (existing.timeout ?? {}) as Record<string, unknown>;
  return {
    ...existing,
    timeout: { ...timeouts, ...existingTimeout },
  };
}

/** Mastra's `MastraTimeoutError` message, as it arrives on the error chunk. */
export function isRunTimeoutError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const record = error as { message?: unknown; name?: unknown };
  if (record.name === "MastraTimeoutError") {
    return true;
  }
  const message =
    typeof error === "string"
      ? error
      : typeof record.message === "string"
        ? record.message
        : "";
  return (
    message.includes("modelSettings.timeout.stepMs") ||
    message.includes("modelSettings.timeout.totalMs")
  );
}

export const EMPTY_REPLY_SCORER_ID = "engenty-reply-present";

/**
 * What the model reads when the scorer fails: Mastra formats it into its
 * completion-feedback block (`Reason: …`) and appends that to the conversation
 * before the extra step.
 */
export const EMPTY_REPLY_NUDGE =
  "You ended the turn without writing a message to the user. Write your reply now: summarize what you did and found, or say what you need from the user. Do not end the turn silently.";

export interface EmptyReplyCompletionOptions {
  /** How many silent turns to push back on before letting the run end. Default 1. */
  maxNudges?: number;
}

/**
 * Mastra `isTaskComplete` config: the turn is complete once the model has
 * written text. A silent step scores 0 at most `maxNudges` times per run —
 * after that it scores 1 so a model that will not speak cannot loop until the
 * step cap (`readMastraStreamFailure` names that silence instead).
 *
 * Mastra runs completion scorers only on steps where the model itself stopped
 * (a step that still wants tool calls is never scored), and skips steps whose
 * only tool calls are working-memory updates.
 */
export function createEmptyReplyCompletion(
  options: EmptyReplyCompletionOptions = {}
): { scorers: CompletionScorer[]; strategy: "all" } {
  let nudgesLeft = options.maxNudges ?? 1;
  // The runtime contract Mastra's completion runner uses is `id`, `name` and
  // `run({ output })` returning `{ score, reason }` — `output` is the step's
  // text. Built as a plain object so no LLM judge is ever wired up for it.
  const scorer = {
    description: "The assistant wrote a reply the user can read.",
    id: EMPTY_REPLY_SCORER_ID,
    name: "Reply present",
    async run(input: { output?: unknown }) {
      const text = typeof input.output === "string" ? input.output.trim() : "";
      if (text) {
        return { reason: "Reply written.", score: 1 };
      }
      if (nudgesLeft <= 0) {
        return { reason: "No reply after nudge; ending the turn.", score: 1 };
      }
      nudgesLeft -= 1;
      return { reason: EMPTY_REPLY_NUDGE, score: 0 };
    },
  } as unknown as CompletionScorer;
  return { scorers: [scorer], strategy: "all" };
}
