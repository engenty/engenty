import { getEngentyCoreBaseUrlFromEnv } from "./core-http-client.js";

/** Card answer → the decision core's approval route accepts. */
const CORE_DECISION = {
  always: "allow_policy",
  deny: "deny",
  once: "allow_once",
} as const;

/**
 * The DURABLE half of approving a tool call in chat.
 *
 * Chat approval used to write ONE thing: an operation-id grant in thread
 * metadata. Only the AI-side pre-gate reads that store. When the card came
 * from core's 202 (the agent-escalation policy, a connections policy — any
 * decision only core can make), core knew nothing about the approval, re-gated
 * the retry, and the run hit `approvalUnavailableResult`: the user approved
 * and nothing ran. This posts the decision to the request core itself filed,
 * so `evaluatePolicy` finds a covering grant on the retry.
 *
 * Scope mapping, deliberately matched to what the card's labels promise:
 *   - "approve once"  → `allow_once`, an unbound single-use grant core deletes
 *     as it spends it.
 *   - "approve always (this chat)" → `allow_policy` BOUND TO THE THREAD. Core
 *     spends subject-bound grants against the run's task/trigger/goal, and a
 *     conversation run's goal id IS the thread id — so the grant covers the
 *     rest of this chat and nothing outside it. (`allow_session` would bind to
 *     the approving request's auth session, which is not the chat.)
 *
 * Runs on the approving USER's bearer token: core scopes the decision to their
 * tenant and records them as the decider. Non-fatal by design — on failure the
 * run continues and core simply re-gates, which is the pre-fix behaviour.
 */
export async function persistCoreApprovalDecision(params: {
  accessToken?: string;
  approvalRequestId: string;
  coreBaseUrl?: string;
  /**
   * The user's answer, in the card's own terms. `deny` mints no grant — it
   * closes the request so it stops sitting in the tenant's approvals queue
   * waiting for an answer that was already given. Without it a denied call
   * stayed `pending` until its 7-day TTL, and the queue showed work nobody
   * still owed.
   */
  decision: "once" | "always" | "deny";
  /** Thread id — the conversation run's goal, and the grant's subject. */
  subjectId?: string;
}): Promise<void> {
  const coreBaseUrl = params.coreBaseUrl ?? getEngentyCoreBaseUrlFromEnv();
  if (!(coreBaseUrl && params.accessToken)) {
    return;
  }
  try {
    const url = new URL(
      `/api/security/approvals/${encodeURIComponent(params.approvalRequestId)}/decision`,
      coreBaseUrl
    );
    const res = await fetch(url, {
      body: JSON.stringify({
        decision: CORE_DECISION[params.decision],
        // A once-grant needs no subject (it is actor+module+operation pinned
        // and dies on first use); a standing one must not outlive the chat.
        ...(params.decision === "always" && params.subjectId
          ? { subject_id: params.subjectId }
          : {}),
      }),
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (res.status === 409) {
      // First to answer wins: someone decided this request from their list
      // (or it expired) before this card was answered. The grant persisted
      // above still carries this resume; nothing to repair.
      return;
    }
    if (!res.ok) {
      console.error(
        `core approval decision failed: ${res.status} ${await res
          .text()
          .catch(() => "")}`
      );
    }
  } catch (err) {
    console.error("core approval decision failed", err);
  }
}
