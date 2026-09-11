// Request-context keys, with NO runtime dependencies.
//
// Same reason `primitive-ids.ts` exists: the save-path validator needs to know
// which keys are reserved for run identity, but importing `run-context.ts` to
// get them drags in the service-scope resolver and, through it, the whole app —
// including the propose tool that imports the validator. Constants live here so
// the pure-function side of the feature stays pure.

/**
 * Keys carrying the run's identity. Namespaced so they can't collide with
 * Mastra's own (`mastra__authToken` &c.) or with anything a graph could set.
 */
export const GRAPH_RUN_CONTEXT = {
  workflowId: "engenty__graph_workflow_id",
  workflowVersion: "engenty__graph_action_version",
  /** Action-level tool allow list; every node's list intersects with this. */
  allowedToolIds: "engenty__graph_allowed_tool_ids",
  contextId: "engenty__graph_context_id",
  /**
   * The specialist this run belongs to — a routine's agent, or the action's
   * owner. Identity, so it comes from the dispatcher and never from graph
   * JSON. It is how a node finds the CHAT to speak into: the run's own thread
   * is a log nobody opens.
   */
  deskAgentId: "engenty__graph_desk_agent_id",
  /**
   * The conversation that ASKED for this run, when a person or an agent asked
   * in one. Present on an `agent` or `command` trigger; absent on a schedule,
   * which nobody asked for from anywhere.
   *
   * It is a pointer, never a place the run writes: the run keeps its own
   * thread, and this only says where the request came from so a step can read
   * the context it was too late to be told.
   */
  callerThreadId: "engenty__graph_caller_thread_id",
  contextType: "engenty__graph_context_type",
  requestId: "engenty__graph_request_id",
  /**
   * Serialized Space for this run. Identity, like tenant — never from the
   * stored graph JSON. See `graph-space.ts`.
   */
  space: "engenty__graph_space",
  /**
   * How a specialist node behaves when its agent reaches a gated operation.
   * Absent = "deny", which is what every published graph did before mid-run
   * approval existed: gates are explicit `approval_gate` nodes. A run that
   * sets "request" lets the node ASK — it suspends with the parked call and
   * resumes replaying it once (Matthias's ruling, 2026-08-24).
   */
  approvalPolicy: "engenty__graph_approval_policy",
  /**
   * The Task this graph run works ON, when there is one. Present => a
   * specialist node gets the task's own tools (comment, ask) so it can report
   * and ask like the instruction lane always could. Absent => a button press
   * or an agent call, which has no task to speak on.
   */
  taskId: "engenty__graph_task_id",
  /**
   * The routine whose fire started this run, when one did. Forwarded to core
   * as `x-engenty-routine-id` so the routine's own approval grants open the
   * gate, and used to root the routine's durable workspace.
   */
  routineId: "engenty__graph_routine_id",
  /**
   * Operations and workspace tools this run may perform without asking —
   * a routine's standing allow-list (`ai.routines.approval_grants`), decided
   * once when a person authored or edited the routine.
   *
   * Per-fire approval is the wrong mechanism for scheduled work: nobody is
   * there to answer at 03:00, so a fire that asks is a fire that does nothing.
   * The moment a human IS present is when the routine is written, so that is
   * where the decision belongs.
   */
  approvalGrants: "engenty__graph_approval_grants",
  tenantId: "engenty__graph_tenant_id",
  threadId: "engenty__graph_thread_id",
  userId: "engenty__graph_user_id",
} as const;
