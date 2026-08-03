import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DAL for core.approval_requests / core.approval_grants (D2 phase 1).
 *
 * These replace the per-process Map that used to back approval-service: a
 * restart lost every pending request and every standing grant, and a second
 * replica never saw the first one's. Requests are the audit record (kept after
 * decision); grants are live authorization (`once` rows are deleted on use).
 * Service-role client — a user must never insert their own grant.
 */

export type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired";

export type ApprovalDecision =
  | "allow_once"
  | "allow_session"
  | "allow_policy"
  | "deny";

/** Wider than core's own three decisions so the tasks/goal writers fold in later. */
export type ApprovalGrantScope =
  | "once"
  | "session"
  | "policy"
  | "task"
  | "trigger"
  | "goal";

export interface ApprovalRequestRow {
  actor_id: string;
  context: Record<string, unknown> | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  decision: ApprovalDecision | null;
  expires_at: string;
  id: string;
  module_id: string;
  operation_id: string;
  reason: string;
  status: ApprovalRequestStatus;
  tenant_id: string;
}

export interface ApprovalGrantRow {
  /** `null` = actor-agnostic, spendable by whoever does the subject's work. */
  actor_id: string | null;
  created_at: string;
  expires_at: string | null;
  granted_by: string | null;
  id: string;
  /** `null` = module-agnostic: the grant names only the operation. */
  module_id: string | null;
  operation_id: string;
  request_id: string | null;
  scope: ApprovalGrantScope;
  subject_id: string | null;
  tenant_id: string;
}

export async function insertApprovalRequest(
  db: SupabaseClient,
  input: {
    actorId: string;
    context?: Record<string, unknown>;
    expiresAt: string;
    moduleId: string;
    operationId: string;
    reason: string;
    tenantId: string;
  }
): Promise<ApprovalRequestRow> {
  const { data, error } = await db
    .schema("core")
    .from("approval_requests")
    .insert({
      actor_id: input.actorId,
      context: input.context ?? null,
      expires_at: input.expiresAt,
      module_id: input.moduleId,
      operation_id: input.operationId,
      reason: input.reason,
      status: "pending",
      tenant_id: input.tenantId,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as ApprovalRequestRow;
}

export async function getApprovalRequest(
  db: SupabaseClient,
  id: string
): Promise<ApprovalRequestRow | null> {
  const { data, error } = await db
    .schema("core")
    .from("approval_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as ApprovalRequestRow | null) ?? null;
}

/**
 * Pending requests for a tenant, oldest first. Rows whose TTL has passed are
 * reported as expired rather than pending — the sweep to `status = 'expired'`
 * happens lazily on decide, so a stale row can never be approved.
 */
export async function listPendingApprovalRequests(
  db: SupabaseClient,
  // `null` lists every tenant — only the superadmin queue passes it. Callers
  // that mean "this tenant" must say so; there is no defaulting, because an
  // omitted filter here would leak one tenant's queue into another's.
  tenantId: string | null,
  now = new Date().toISOString()
): Promise<ApprovalRequestRow[]> {
  let query = db
    .schema("core")
    .from("approval_requests")
    .select("*")
    .eq("status", "pending")
    .gt("expires_at", now);
  if (tenantId !== null) {
    query = query.eq("tenant_id", tenantId);
  }
  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as ApprovalRequestRow[];
}

/**
 * The live pending request for (actor, module, operation), if one exists.
 * Used to dedupe: a blocked caller that retries must find its earlier request
 * answered or still open, not stack a new queue entry per attempt.
 */
export async function findPendingApprovalRequest(
  db: SupabaseClient,
  input: {
    actorId: string;
    moduleId: string;
    now?: string;
    operationId: string;
    tenantId: string;
  }
): Promise<ApprovalRequestRow | null> {
  const { data, error } = await db
    .schema("core")
    .from("approval_requests")
    .select("*")
    .eq("tenant_id", input.tenantId)
    .eq("actor_id", input.actorId)
    .eq("module_id", input.moduleId)
    .eq("operation_id", input.operationId)
    .eq("status", "pending")
    .gt("expires_at", input.now ?? new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    throw error;
  }
  return ((data ?? [])[0] as ApprovalRequestRow | undefined) ?? null;
}

/**
 * Requests for one module — or one module FAMILY — in one tenant, newest
 * first; the shape a module's own approvals UI lists. An array covers stores
 * whose requests are filed under several provenances (connections: core's
 * gate files a connector action's request under the connector module's id,
 * e.g. "connections-google", while the module's own writes use
 * "connections"). Undecided rows past their TTL are excluded when
 * `status: "pending"` is asked for, same lazy-expiry rule as the tenant list.
 */
export async function listApprovalRequestsForModule(
  db: SupabaseClient,
  input: {
    limit?: number;
    moduleId: string | string[];
    now?: string;
    status?: ApprovalRequestStatus;
    tenantId: string;
  }
): Promise<ApprovalRequestRow[]> {
  let query = db
    .schema("core")
    .from("approval_requests")
    .select("*")
    .eq("tenant_id", input.tenantId);
  query = Array.isArray(input.moduleId)
    ? query.in("module_id", input.moduleId)
    : query.eq("module_id", input.moduleId);
  if (input.status) {
    query = query.eq("status", input.status);
    if (input.status === "pending") {
      query = query.gt("expires_at", input.now ?? new Date().toISOString());
    }
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (error) {
    throw error;
  }
  return (data ?? []) as ApprovalRequestRow[];
}

/**
 * Record a decision. Conditioned on `status = 'pending'` so two approvers
 * racing the same request cannot both win — the loser gets null and the caller
 * re-reads the already-decided row.
 */
export async function decideApprovalRequest(
  db: SupabaseClient,
  input: {
    decidedAt: string;
    decidedBy: string;
    decision: ApprovalDecision;
    id: string;
    tenantId: string;
  }
): Promise<ApprovalRequestRow | null> {
  const { data, error } = await db
    .schema("core")
    .from("approval_requests")
    .update({
      decided_at: input.decidedAt,
      decided_by: input.decidedBy,
      decision: input.decision,
      status: input.decision === "deny" ? "denied" : "approved",
    })
    .eq("id", input.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return (data as ApprovalRequestRow | null) ?? null;
}

export async function insertApprovalGrant(
  db: SupabaseClient,
  input: {
    /**
     * `null` = actor-agnostic: any principal doing the granted subject's work
     * may spend it (same convention as agent_goal_grants.agent_id). The task
     * approval flow needs this — "this TASK may create the PR" is approved
     * before anyone knows which agent principal the retry will run as. A null
     * actor without a subject would be a tenant-wide blank check, so it is
     * refused here.
     */
    actorId: string | null;
    expiresAt?: string | null;
    grantedBy?: string | null;
    /**
     * `null` = module-agnostic. Operation ids are globally unique (core
     * invokes by operation id alone), so the module adds provenance, not
     * precision — and a human approving "operation X for this task" from the
     * task UI has no module in hand. Same guard as the actor axis: a
     * module-agnostic grant must be bound to a subject.
     */
    moduleId: string | null;
    operationId: string;
    requestId?: string | null;
    scope: ApprovalGrantScope;
    subjectId?: string | null;
    tenantId: string;
  }
): Promise<ApprovalGrantRow> {
  if ((input.actorId === null || input.moduleId === null) && !input.subjectId) {
    throw new Error(
      "approvals: an actor- or module-agnostic grant must be bound to a subject"
    );
  }
  const { data, error } = await db
    .schema("core")
    .from("approval_grants")
    .insert({
      actor_id: input.actorId,
      expires_at: input.expiresAt ?? null,
      granted_by: input.grantedBy ?? null,
      module_id: input.moduleId,
      operation_id: input.operationId,
      request_id: input.requestId ?? null,
      scope: input.scope,
      subject_id: input.subjectId ?? null,
      tenant_id: input.tenantId,
    })
    .select("*")
    .single();
  if (error) {
    throw error;
  }
  return data as ApprovalGrantRow;
}

/**
 * Find a live grant covering (tenant, actor, module, operation) and consume it.
 * `once` grants are deleted on use — and the delete is what decides the race:
 * two concurrent calls both read the row, both try to delete it, and only the
 * one whose delete returns a row is allowed through.
 *
 * Matching is two independent axes:
 * - WHO: a grant with an actor matches only that actor; `actor_id null` is
 *   actor-agnostic (whoever does the subject's work — the task-approval case,
 *   where the retry's principal is unknowable at approval time).
 * - WHERE: a grant with a subject applies only when the caller names that
 *   subject (session id for session scope, task/trigger/goal ids otherwise) —
 *   an unscoped call must never inherit a task's or goal's elevation. A
 *   subject-free grant applies anywhere the actor does.
 */
export async function consumeApprovalGrant(
  db: SupabaseClient,
  input: {
    actorId: string;
    moduleId: string;
    operationId: string;
    sessionId?: string | null;
    subjectIds?: string[];
    tenantId: string;
    now?: string;
  }
): Promise<boolean> {
  const { data, error } = await db
    .schema("core")
    .from("approval_grants")
    .select("*")
    .or(`actor_id.eq.${input.actorId},actor_id.is.null`)
    .or(`module_id.eq.${input.moduleId},module_id.is.null`)
    .eq("tenant_id", input.tenantId)
    .eq("operation_id", input.operationId);
  if (error) {
    throw error;
  }
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  const subjects = new Set(input.subjectIds ?? []);
  const candidates = ((data ?? []) as ApprovalGrantRow[]).filter((row) => {
    if (row.expires_at && Date.parse(row.expires_at) <= nowMs) {
      return false;
    }
    if (row.actor_id !== null && row.actor_id !== input.actorId) {
      return false;
    }
    if (row.module_id !== null && row.module_id !== input.moduleId) {
      return false;
    }
    if (row.scope === "session") {
      return !!input.sessionId && row.subject_id === input.sessionId;
    }
    if (row.subject_id) {
      return subjects.has(row.subject_id);
    }
    // Subject-free grants must be fully pinned on the other axes — anything
    // agnostic (actor or module) without a subject would be a blank check;
    // the writer refuses to mint those, and the reader refuses to honor one
    // that got into the table some other way.
    return row.actor_id !== null && row.module_id !== null;
  });
  if (candidates.length === 0) {
    return false;
  }
  // Prefer consuming a single-use grant over burning a standing one.
  const once = candidates.find((row) => row.scope === "once");
  if (!once) {
    return true;
  }
  const { data: deleted, error: deleteError } = await db
    .schema("core")
    .from("approval_grants")
    .delete()
    .eq("id", once.id)
    .select("id")
    .maybeSingle();
  if (deleteError) {
    throw deleteError;
  }
  // Lost the race for this row — fall back to any standing grant we also saw.
  if (!deleted) {
    return candidates.some((row) => row.scope !== "once");
  }
  return true;
}

/**
 * Operation ids granted to any of the named subjects (unexpired), deduped.
 * This is the dispatch-time read: a run assembles its pre-gate grant set from
 * the subjects it works under (task, trigger) instead of from per-table
 * grant columns. Read-only — once-grants stay live so a core-side gate can
 * still spend them during the run; the dispatcher reaps them after it.
 */
export async function listGrantOperationIdsForSubjects(
  db: SupabaseClient,
  input: { now?: string; subjectIds: string[]; tenantId: string }
): Promise<string[]> {
  if (input.subjectIds.length === 0) {
    return [];
  }
  const { data, error } = await db
    .schema("core")
    .from("approval_grants")
    .select("operation_id, expires_at")
    .eq("tenant_id", input.tenantId)
    .in("subject_id", input.subjectIds);
  if (error) {
    throw error;
  }
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  return [
    ...new Set(
      ((data ?? []) as Pick<ApprovalGrantRow, "expires_at" | "operation_id">[])
        .filter((r) => !r.expires_at || Date.parse(r.expires_at) > nowMs)
        .map((r) => r.operation_id)
    ),
  ];
}

/**
 * All unexpired grants bound to one subject, with their scopes — the read
 * behind a subject's approval UI (e.g. the task sidebar's "Approved tools"
 * section splits scope "task" from scope "once").
 */
export async function listGrantsForSubject(
  db: SupabaseClient,
  input: { now?: string; subjectId: string; tenantId: string }
): Promise<Pick<ApprovalGrantRow, "operation_id" | "scope">[]> {
  const { data, error } = await db
    .schema("core")
    .from("approval_grants")
    .select("operation_id, scope, expires_at")
    .eq("tenant_id", input.tenantId)
    .eq("subject_id", input.subjectId);
  if (error) {
    throw error;
  }
  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  return (
    (data ?? []) as Pick<
      ApprovalGrantRow,
      "expires_at" | "operation_id" | "scope"
    >[]
  )
    .filter((r) => !r.expires_at || Date.parse(r.expires_at) > nowMs)
    .map((r) => ({ operation_id: r.operation_id, scope: r.scope }));
}

/**
 * Revoke one operation's grants on a subject — the human "remove approved
 * tool" affordance. Deliberately scope-blind: revocation should err on
 * removing more, so a lingering once-row for the same op dies with the
 * standing one.
 */
export async function revokeApprovalGrant(
  db: SupabaseClient,
  input: { operationId: string; subjectId: string; tenantId: string }
): Promise<void> {
  const { error } = await db
    .schema("core")
    .from("approval_grants")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("subject_id", input.subjectId)
    .eq("operation_id", input.operationId);
  if (error) {
    throw error;
  }
}

/** Reap grants bound to a finished subject (session end, task/goal completion). */
export async function revokeApprovalGrantsForSubject(
  db: SupabaseClient,
  input: { scope: ApprovalGrantScope; subjectId: string; tenantId: string }
): Promise<void> {
  const { error } = await db
    .schema("core")
    .from("approval_grants")
    .delete()
    .eq("tenant_id", input.tenantId)
    .eq("scope", input.scope)
    .eq("subject_id", input.subjectId);
  if (error) {
    throw error;
  }
}
