/**
 * Interactive tool-approval resume steers the model with a one-line nudge
 * (`Approved: you may now run "op". Proceed…`). That string is not a user
 * utterance — the transcript already has the Approve/Deny widget — so it must
 * not render as a user bubble.
 */

const APPROVED_NUDGE =
  /^Approved: you may now run ".*"\. Proceed with the operation\.$/;
const DENIED_NUDGE =
  /^The user denied ".*"\. Do not run it; continue without that operation\.$/;

export function isToolApprovalResumeNudgeText(text: string): boolean {
  const trimmed = text.trim();
  return APPROVED_NUDGE.test(trimmed) || DENIED_NUDGE.test(trimmed);
}
