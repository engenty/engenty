/**
 * Reading the outcome of a Data-tree write (PLAN-space-data-agent-crud P3.3).
 *
 * Pure and dependency-free on purpose: three of the four things that can come
 * back are NOT failures, each needs a different sentence and a different
 * affordance, and that classification is worth testing without a React tree or
 * a query client around it.
 */

/**
 * What actually happened, in the four flavours a caller must tell apart.
 *
 * `approval` is the one most easily lost: the gate arrives as a 202 INSIDE
 * `response.ok`, so a UI that only checks for errors reports success while a
 * human is still being asked — and the person walks away believing the change
 * landed.
 *
 * **`approval` and `conflict` carry no message, on purpose.** Their wording is
 * ours to write and therefore ours to TRANSLATE, and this module is pure so it
 * has no `t`. The caller — which has one — supplies the sentence. The other two
 * DO carry a message, because it came from the server and names the module's
 * own action ("use `contacts_create`"); replacing that with a generic string
 * would throw away the only part that tells the person where to go.
 */
export type SpaceDataOutcome =
  | { kind: "approval" }
  | { kind: "conflict" }
  | { kind: "unsupported"; message: string }
  | { kind: "error"; message: string };

interface ErrorLike {
  code?: unknown;
  details?: unknown;
  message?: string;
  status?: unknown;
}

/**
 * The error code, read from BOTH shapes it can arrive in.
 *
 * Core's own refusals are wrapped (`{ok:false, error:{code}}`), but an
 * ADAPTER's refusal travels through `invokeOperation`'s passthrough and arrives
 * FLAT (`{code, message, details}`). The api client only understands the
 * wrapped shape, so a flat `data_conflict` degrades to `request_failed` and
 * survives only inside `details`. Reading both here means no call site has to
 * know that.
 */
function codeOf(error: ErrorLike): string {
  if (typeof error.code === "string" && error.code !== "request_failed") {
    return error.code;
  }
  const details = error.details as { code?: unknown } | null | undefined;
  return typeof details?.code === "string" ? details.code : "";
}

export function describeSpaceDataOutcome(error: unknown): SpaceDataOutcome {
  const failure = (error ?? {}) as ErrorLike;
  const status = typeof failure.status === "number" ? failure.status : 0;
  const code = codeOf(failure);
  const message = failure.message ?? "";

  // Status first where it is unambiguous: a 409 is a conflict whatever the body
  // managed to carry, and relying on the code alone would lose the ones the
  // wrapper flattened.
  if (status === 409 || code === "data_conflict") {
    return { kind: "conflict" };
  }
  if (status === 202 || code === "approval_required") {
    return { kind: "approval" };
  }
  if (status === 405 || code === "not_supported") {
    // The module's own message names what to do instead, so it is kept
    // verbatim: replacing it with "unsupported" would throw away the only part
    // that tells the person where to go.
    return { kind: "unsupported", message };
  }
  return { kind: "error", message };
}
