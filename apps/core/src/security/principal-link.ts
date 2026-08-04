import type { PrincipalContext } from "./auth.js";

/**
 * The verified principal behind an auth object handed to a module handler,
 * plus whether the edge that produced it was itself approval-gated.
 */
export interface LinkedPrincipal {
  /**
   * True when the decision for the outer edge was a GATED one that passed: the
   * operation declared `requiresApproval` (or risk >= high) and policy allowed
   * it — because a human is the principal, because a grant covered it, or
   * because the unattended platform-service lane applies. A plain
   * capability-allow on a non-gated operation must never set it, or every read
   * becomes a springboard for a gated nested call.
   */
  approvedEdge: boolean;
  principal: PrincipalContext;
}

/**
 * Auth object identity → the principal core resolved for it.
 *
 * `PluginAuthContext` is a lossy projection of `PrincipalContext` (no
 * moduleIds, scopes, taskId, sessionId, authMethod), and it is a plain object
 * a module could also hand-write. Keeping the real principal in a WeakMap
 * keyed by the object core itself created means the in-process gate
 * (see in-process-gate.ts) evaluates the SAME principal the HTTP edge did
 * whenever a module passes `ctx.auth` straight through — which every live call
 * site does — and that `approvedEdge` cannot be forged by writing a property.
 * Entries die with the request object; nothing to clean up.
 */
const linkedPrincipals = new WeakMap<object, LinkedPrincipal>();

/** Record the principal behind `authContext` and return it unchanged. */
export function linkPrincipal<T extends object>(
  authContext: T,
  link: LinkedPrincipal
): T {
  linkedPrincipals.set(authContext, link);
  return authContext;
}

/** The principal core linked to this auth object, if core created it. */
export function resolveLinkedPrincipal(
  authContext: object | undefined
): LinkedPrincipal | undefined {
  return authContext ? linkedPrincipals.get(authContext) : undefined;
}

/**
 * Whether the decision that produced this edge was gated-and-passed — the
 * input to `LinkedPrincipal.approvedEdge`. Shared by every transport so the
 * three edges can never drift on what "approved" means.
 */
export function isApprovedEdge(params: {
  action: "allow" | "deny" | "require_approval";
  requiresApproval: boolean;
  riskLevel: "low" | "medium" | "high" | "critical";
}): boolean {
  if (params.action !== "allow") {
    return false;
  }
  return (
    params.requiresApproval ||
    params.riskLevel === "high" ||
    params.riskLevel === "critical"
  );
}
