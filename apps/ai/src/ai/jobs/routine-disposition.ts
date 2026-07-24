// Marker-token protocol for routine run disposition. Cheap and tool-free;
// a structured task_report tool can replace it later without changing semantics.

export type RoutineDisposition = "quiet" | "report" | "review";

export interface RoutineDispositionResult {
  cleanedText: string;
  disposition: RoutineDisposition;
  /** Present when disposition is `review` and a reason followed the token. */
  reviewReason?: string;
}

const OK_TOKEN = "ROUTINE_OK";
const REVIEW_TOKEN = "ROUTINE_REVIEW";

const OK_ONLY = new RegExp(`^\\s*${OK_TOKEN}\\s*$`, "i");
const REVIEW_ONLY = new RegExp(`^\\s*${REVIEW_TOKEN}\\s*:?\\s*(.*?)\\s*$`, "i");
const OK_AT_END = new RegExp(`(?:^|\\n)\\s*${OK_TOKEN}\\s*$`, "i");
const OK_AT_START = new RegExp(`^\\s*${OK_TOKEN}\\s*(?:\\n|$)`, "i");
const REVIEW_AT_END = new RegExp(
  `(?:^|\\n)\\s*${REVIEW_TOKEN}\\s*:?\\s*(.*?)\\s*$`,
  "i"
);
const REVIEW_AT_START = new RegExp(
  `^\\s*${REVIEW_TOKEN}\\s*:?\\s*(.*?)(?:\\n|$)`,
  "i"
);

/**
 * Parse disposition markers from a specialist result. Tokens at the start or
 * end of the text are stripped; a mid-text token is left in place and treated
 * as a normal report (not a disposition marker).
 *
 * Quiet is only a bare `ROUTINE_OK`. A body plus trailing/leading OK is a
 * report (token stripped) — agents often append OK after a substantive cycle.
 */
export function parseRoutineDisposition(
  resultText: string | null | undefined
): RoutineDispositionResult {
  const raw = typeof resultText === "string" ? resultText : "";
  const trimmed = raw.trim();

  if (!trimmed) {
    return { cleanedText: "", disposition: "report" };
  }

  if (OK_ONLY.test(trimmed)) {
    return { cleanedText: "", disposition: "quiet" };
  }

  const reviewOnly = REVIEW_ONLY.exec(trimmed);
  if (reviewOnly && !trimmed.includes("\n")) {
    const reason = (reviewOnly[1] ?? "").trim();
    return {
      cleanedText: reason,
      disposition: "review",
      ...(reason ? { reviewReason: reason } : {}),
    };
  }

  // Prefer end-of-message markers (agents typically append the token).
  if (OK_AT_END.test(trimmed)) {
    const cleaned = trimmed.replace(OK_AT_END, "").trim();
    return {
      cleanedText: cleaned,
      disposition: cleaned ? "report" : "quiet",
    };
  }

  const reviewEnd = REVIEW_AT_END.exec(trimmed);
  if (reviewEnd) {
    const reason = (reviewEnd[1] ?? "").trim();
    const cleaned = trimmed.replace(REVIEW_AT_END, "").trim();
    const body = cleaned || reason;
    return {
      cleanedText: body,
      disposition: "review",
      ...(reason ? { reviewReason: reason } : {}),
    };
  }

  if (OK_AT_START.test(trimmed)) {
    const cleaned = trimmed.replace(OK_AT_START, "").trim();
    return {
      cleanedText: cleaned,
      disposition: cleaned ? "report" : "quiet",
    };
  }

  const reviewStart = REVIEW_AT_START.exec(trimmed);
  if (reviewStart) {
    const reason = (reviewStart[1] ?? "").trim();
    const cleaned = trimmed.replace(REVIEW_AT_START, "").trim();
    const body = [reason, cleaned].filter(Boolean).join("\n").trim();
    return {
      cleanedText: body,
      disposition: "review",
      ...(reason ? { reviewReason: reason } : {}),
    };
  }

  // Mid-text token (or no token) → normal report; leave text unchanged.
  return { cleanedText: trimmed, disposition: "report" };
}
