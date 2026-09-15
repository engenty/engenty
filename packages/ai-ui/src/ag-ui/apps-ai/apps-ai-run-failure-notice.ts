// A failed run that never wrote a word must still leave a mark in the
// transcript. The live SSE path appends a `run-error-<runId>` assistant notice
// on RUN_ERROR; this rebuilds the same notice from the persisted run row for
// every path that does not see that event — reload, a second window, a run
// killed by a process restart, or a transcript re-sync that replaced the lane.

import { readAgUiMessageCreatedAt } from "@engenty/ai-core/browser";
import type { AiAgentRunSummary } from "../../lib/admin/ai-runtime-types.js";
import { agUiMessageText, type EngentyAgUiMessage } from "../conversation.js";
import { formatCopilotRunError } from "../run-error-message.js";

const SAME_TURN_SLACK_MS = 30_000;

export function runErrorNoticeId(runId: string): string {
  return `run-error-${runId}`;
}

function toEpochMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Whether the tail turn — everything after the last user message — already
 * says something to the person. Tool-call rows without text do not count:
 * that is exactly the "sixteen closed tool cards and then silence" shape.
 */
function tailTurnHasAssistantText(
  messages: readonly EngentyAgUiMessage[]
): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (message.role === "user") {
      return false;
    }
    if (message.role === "assistant" && agUiMessageText(message)) {
      return true;
    }
  }
  return false;
}

function lastUserMessageAtMs(
  messages: readonly EngentyAgUiMessage[]
): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return toEpochMs(readAgUiMessageCreatedAt(message));
    }
  }
  return null;
}

/**
 * The notice to append for `run` given the transcript as it will render, or
 * null when nothing is owed: the run did not fail, carries no error, belongs
 * to an earlier turn, the person cancelled it, or its turn already ends in
 * assistant text (the failure is then a mid-reply cut, which the partial text
 * itself conveys).
 */
export function buildTerminalRunFailureNotice(params: {
  messages: readonly EngentyAgUiMessage[];
  run: AiAgentRunSummary | null;
}): EngentyAgUiMessage | null {
  const { messages, run } = params;
  if (!(run && (run.status === "failed" || run.status === "timed_out"))) {
    return null;
  }
  const error = run.error?.trim();
  if (!error) {
    return null;
  }
  const noticeId = runErrorNoticeId(run.id);
  if (messages.some((message) => message.id === noticeId)) {
    return null;
  }
  if (tailTurnHasAssistantText(messages)) {
    return null;
  }
  // A failed run from an earlier turn is not this turn's news: the person has
  // since typed again. Only compare when both sides carry a timestamp, and
  // allow for the prompt row being persisted a moment after the run row.
  const runStartedMs = toEpochMs(run.started_at ?? run.created_at);
  const userAtMs = lastUserMessageAtMs(messages);
  if (
    runStartedMs !== null &&
    userAtMs !== null &&
    userAtMs > runStartedMs + SAME_TURN_SLACK_MS
  ) {
    return null;
  }
  return {
    id: noticeId,
    role: "assistant",
    content: formatCopilotRunError(error),
  };
}
