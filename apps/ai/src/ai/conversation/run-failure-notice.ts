// The visible half of a silently-stopped run.
//
// A `finishReason: "length"` (or "content-filter") step executes its
// already-emitted tool calls and ends the agent loop CLEANLY — no error, no
// assistant text, run "completed". Live, the RUN_ERROR banner names it; but the
// banner is session state, and after a reload the thread reads as "no response".
// This appends the explanation as a durable assistant message, in the user's UI
// language (the same `route_context.ui_language` the run's own instructions
// already answer in).
import type { ThreadStore } from "../../dal/threads/index.js";
import {
  AGENT_THREADS_CONTENT_FILTERED,
  AGENT_THREADS_OUTPUT_TRUNCATED,
} from "../sessions/mastra-stream-failure.js";
import type { AiSessionScope } from "../sessions/types.js";

const NOTICES: Record<string, { de: string; en: string }> = {
  [AGENT_THREADS_OUTPUT_TRUNCATED]: {
    de: "Mir ist der Kontext ausgegangen, bevor ich antworten konnte. Starte einen neuen Chat oder fahre hier mit einer kürzeren Anfrage fort.",
    en: "I ran out of context before I could write a reply. Start a new chat, or continue here with a shorter request.",
  },
  [AGENT_THREADS_CONTENT_FILTERED]: {
    de: "Der Inhaltsfilter des Modellanbieters hat diese Antwort gestoppt. Formuliere deine Anfrage um und versuche es erneut.",
    en: "The model provider's content filter stopped this reply. Rephrase your request and try again.",
  },
};

/**
 * User-facing wording for a run failure that ended the turn with NO visible
 * text. Null for every other failure — those carry a provider message the
 * RUN_ERROR banner already shows, and a persisted paraphrase would drift.
 */
export function runFailureNoticeText(
  failureMessage: string,
  uiLanguage: string | null
): string | null {
  const notice = NOTICES[failureMessage];
  if (!notice) {
    return null;
  }
  return uiLanguage?.toLowerCase().startsWith("de") ? notice.de : notice.en;
}

/**
 * Persist the notice as its OWN assistant message, keyed `<runId>-notice`.
 *
 * Not folded into the turn transcript: on these finishes Mastra reached
 * end-of-generation, so memory has already flushed the turn's tool calls —
 * re-writing them under our message id would render every tool card twice.
 */
export async function persistRunFailureNotice(input: {
  runId: string;
  scope: AiSessionScope;
  store: ThreadStore;
  text: string;
  threadId: string;
}): Promise<void> {
  try {
    await input.store.appendMessage({
      authorUserId: null,
      id: `${input.runId}-notice`,
      parts: [{ text: input.text, type: "text" }],
      role: "assistant",
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
    });
  } catch (error) {
    // Never fail teardown for its own bookkeeping — but loud, because a silent
    // miss recreates the very "no response" this exists to fix.
    console.error(
      `[conversation ${input.runId}] persisting run failure notice failed:`,
      error
    );
  }
}
