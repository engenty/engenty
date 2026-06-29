/**
 * Colocated human-in-the-loop (Enhancing Copilot Ch.5). A HITL tool is a
 * `requires_confirmation` frontend tool whose browser handler does not run
 * automatically — instead an inline card collects the user's answer and resumes
 * the run with it. Two pieces, both pure (no React):
 *
 * - a render registry, keyed by tool name, so the tool-call card can look up the
 *   module-provided card for a suspended HITL tool;
 * - a per-call answer store. The frontend-tool handler `await`s the answer; the
 *   card resolves it. Reusing the frontend-tool resume path means no new transport.
 */
import type { ReactNode } from "react";
import type { z } from "zod";

export type HumanInTheLoopStatus = "executing" | "submitted" | "complete";

export interface HumanInTheLoopRenderProps<TInput> {
  /** Validated tool args (parsed by the registered schema). */
  input: TInput;
  /** Resolve the suspended tool call with the user's answer (becomes the tool output). */
  respond: (answer: unknown) => void;
  /** `executing` = suspended awaiting the user; `submitted` = answer sent, resuming. */
  status: HumanInTheLoopStatus;
}

export interface HumanInTheLoopEntry {
  render: (props: HumanInTheLoopRenderProps<unknown>) => ReactNode;
  schema: z.ZodType;
}

const renders = new Map<string, HumanInTheLoopEntry>();

/** Register a HITL render for a tool name. Returns a cleanup to unregister. */
export function registerHumanInTheLoopRender(
  name: string,
  entry: HumanInTheLoopEntry
): () => void {
  renders.set(name, entry);
  return () => {
    if (renders.get(name) === entry) {
      renders.delete(name);
    }
  };
}

export function getHumanInTheLoopRender(
  name: string
): HumanInTheLoopEntry | undefined {
  return renders.get(name);
}

// --- per-call answer store ---
// Order-robust: `respond` (resolveHumanAnswer) and the handler (awaitHumanAnswer)
// can arrive in either order without hanging.

interface PendingAnswer {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
}

const pendingAnswers = new Map<string, PendingAnswer>();
const resolvedAnswers = new Map<string, unknown>();

/** The frontend-tool handler awaits this; resolves when the card calls `respond`. */
export function awaitHumanAnswer(callId: string): Promise<unknown> {
  if (resolvedAnswers.has(callId)) {
    const value = resolvedAnswers.get(callId);
    resolvedAnswers.delete(callId);
    return Promise.resolve(value);
  }
  const existing = pendingAnswers.get(callId);
  if (existing) {
    return existing.promise;
  }
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise<unknown>((r) => {
    resolve = r;
  });
  pendingAnswers.set(callId, { promise, resolve });
  return promise;
}

/** The card calls this with the user's answer; unblocks the handler. */
export function resolveHumanAnswer(callId: string, answer: unknown): void {
  const existing = pendingAnswers.get(callId);
  if (existing) {
    existing.resolve(answer);
    pendingAnswers.delete(callId);
    return;
  }
  resolvedAnswers.set(callId, answer);
}
