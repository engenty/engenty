// Marker-token protocol for "I cannot finish this without an answer".
//
// Until now the only way a headless run could stop and wait for a human was the
// TOOL-APPROVAL gate: a gated operation it had no grant for. Everything else —
// an ambiguous record, a missing decision, a question only the requester can
// answer — had nowhere to go. The run either guessed or wrote its question into
// a result comment that reads like a report and parks the task in `in_review`
// alongside finished work.
//
// A marker line the model writes and this module strips — cheap and tool-free.
// An ordinary assigned task is exactly where a specialist most often needs
// something from the person who assigned it.
export interface TaskBlockedResult {
  /** The result text with the token line removed. */
  cleanedText: string;
  /** What the run needs, one line, as the model wrote it. */
  question: string;
}

const BLOCKED_TOKEN = "TASK_BLOCKED";

const BLOCKED_AT_START = new RegExp(
  `^\\s*${BLOCKED_TOKEN}\\s*:?\\s*(.*?)(?:\\n|$)`,
  "i"
);
const BLOCKED_AT_END = new RegExp(
  `(?:^|\\n)\\s*${BLOCKED_TOKEN}\\s*:?\\s*(.*?)\\s*$`,
  "i"
);

/**
 * Parse a `TASK_BLOCKED: <what I need>` marker from a specialist's result.
 * Returns null when the run finished normally. A token with no question after
 * it does NOT count — "blocked, reason unspecified" is a worse outcome than a
 * plain report, because nobody can act on it.
 */
export function parseTaskBlocked(
  resultText: string | null | undefined
): TaskBlockedResult | null {
  const trimmed = typeof resultText === "string" ? resultText.trim() : "";
  if (!trimmed) {
    return null;
  }
  // Prefer the end-of-message marker: models append it after explaining.
  const atEnd = BLOCKED_AT_END.exec(trimmed);
  if (atEnd) {
    const question = (atEnd[1] ?? "").trim();
    if (question) {
      return {
        cleanedText: trimmed.replace(BLOCKED_AT_END, "").trim(),
        question,
      };
    }
  }
  const atStart = BLOCKED_AT_START.exec(trimmed);
  if (atStart) {
    const question = (atStart[1] ?? "").trim();
    if (question) {
      return {
        cleanedText: trimmed.replace(BLOCKED_AT_START, "").trim(),
        question,
      };
    }
  }
  return null;
}
