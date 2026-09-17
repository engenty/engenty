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
  AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED,
  AGENT_THREADS_EMPTY_REPLY,
  AGENT_THREADS_GUARDRAIL_TRIPPED,
  AGENT_THREADS_OUTPUT_TRUNCATED,
  AGENT_THREADS_RUN_TIMED_OUT,
  AGENT_THREADS_STEP_LIMIT_REACHED,
} from "../sessions/mastra-stream-failure.js";
import type { AiSessionScope } from "../sessions/types.js";

const NOTICES: Record<string, { de: string; en: string }> = {
  [AGENT_THREADS_OUTPUT_TRUNCATED]: {
    de: "Mir ist der Kontext ausgegangen, bevor ich antworten konnte. Starte einen neuen Chat oder fahre hier mit einer kürzeren Anfrage fort.",
    en: "I ran out of context before I could write a reply. Start a new chat, or continue here with a shorter request.",
  },
  [AGENT_THREADS_CONTEXT_LENGTH_EXCEEDED]: {
    de: "Dieser Chat ist für das gewählte Modell zu lang geworden. Starte einen neuen Chat oder bitte um ein kleineres Ergebnis.",
    en: "This chat has grown too long for the selected model. Start a new chat, or ask for a smaller result.",
  },
  [AGENT_THREADS_CONTENT_FILTERED]: {
    de: "Der Inhaltsfilter des Modellanbieters hat diese Antwort gestoppt. Formuliere deine Anfrage um und versuche es erneut.",
    en: "The model provider's content filter stopped this reply. Rephrase your request and try again.",
  },
  [AGENT_THREADS_RUN_TIMED_OUT]: {
    de: "Das Modell hat zu lange nicht geantwortet, deshalb habe ich abgebrochen. Sende die Nachricht erneut oder teile die Aufgabe in kleinere Schritte.",
    en: "The model took too long to respond, so I stopped. Send the message again, or split the task into smaller steps.",
  },
  [AGENT_THREADS_STEP_LIMIT_REACHED]: {
    de: "Ich habe die maximale Anzahl an Arbeitsschritten für diese Runde erreicht, bevor ich antworten konnte. Schreib „weiter“, um fortzufahren, oder verkleinere die Aufgabe.",
    en: "I reached the step limit for this turn before I could write a reply. Say “continue” to carry on, or narrow the task.",
  },
  [AGENT_THREADS_EMPTY_REPLY]: {
    de: "Ich habe diese Runde ohne Antwort beendet. Sende die Nachricht erneut oder formuliere die Frage konkreter.",
    en: "I ended this turn without a reply. Send the message again, or make the request more specific.",
  },
  [AGENT_THREADS_GUARDRAIL_TRIPPED]: {
    de: "Eine Sicherheitsregel hat diese Nachricht blockiert. Formuliere sie um und versuche es erneut.",
    en: "A safety guardrail blocked this message. Rephrase it and try again.",
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
