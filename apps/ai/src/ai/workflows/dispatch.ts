// Graph-action dispatch: turn a pinned version's JSON into a running workflow.
//
// Two rules shape this file:
//
// 1. **Rehydrate per run, never register globally.** `mastra.addStoredWorkflow`
//    would put a tenant's graph on the process-wide registry, where another
//    tenant's nested-workflow reference could resolve it — the same shape as the
//    TRK-14 cross-tenant read. Instead each dispatch builds a throwaway Mastra
//    carrying only the primitives, rehydrates the pinned graph onto it, and runs.
//    The pg snapshot store is shared, so durability and crash-resume still work.
//
// 2. **Identity comes from the request context, never the graph.** The graph is
//    untrusted data; `buildGraphRequestContext` is the only place a run learns
//    its tenant, and primitives refuse to execute without it.
import { Mastra } from "@mastra/core";
import { RequestContext } from "@mastra/core/request-context";
import { rehydrateWorkflow } from "@mastra/core/workflows";
import { getEngentyToolsRunContext } from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { WorkflowVersionRow } from "../../dal/workflows/index.js";
import { createThreadStoreFromEnv } from "../index.js";
import { createEngentyMastraStorage } from "../mastra-storage.js";
import { executionSpaceId } from "../sessions/execution-lane.js";
import {
  resolveRunSpaceForThread,
  toolsSpaceFromResolution,
} from "../sessions/run-space.js";
import { setTraceContext } from "../trace-context.js";
import { serializeGraphSpace } from "./graph-space.js";
import { createGraphActionPrimitives } from "./primitives/index.js";
import { GRAPH_RUN_CONTEXT, type GraphRunContext } from "./run-context.js";
import { watchGraphRunEvents } from "./run-events.js";

/** Workflow id for a pinned version — stable so snapshots stay resolvable. */
export function graphWorkflowId(version: {
  workflow_id: string;
  version: number;
}): string {
  return `workflow:${version.workflow_id}:v${version.version}`;
}

export function buildGraphRequestContext(ctx: GraphRunContext): RequestContext {
  const requestContext = new RequestContext();
  // Identity for the run's trace — see trace-context.ts.
  setTraceContext(requestContext, {
    agentId: ctx.deskAgentId,
    lane: "workflow",
    runId: ctx.requestId,
    spaceId: executionSpaceId(ctx.space),
    tenantId: ctx.tenantId,
    threadId: ctx.threadId,
    userId: ctx.userId,
  });
  requestContext.set(GRAPH_RUN_CONTEXT.tenantId, ctx.tenantId);
  requestContext.set(GRAPH_RUN_CONTEXT.requestId, ctx.requestId);
  requestContext.set(GRAPH_RUN_CONTEXT.threadId, ctx.threadId);
  requestContext.set(GRAPH_RUN_CONTEXT.workflowId, ctx.workflowId);
  requestContext.set(GRAPH_RUN_CONTEXT.workflowVersion, ctx.workflowVersion);
  if (ctx.contextType) {
    requestContext.set(GRAPH_RUN_CONTEXT.contextType, ctx.contextType);
  }
  if (ctx.contextId) {
    requestContext.set(GRAPH_RUN_CONTEXT.contextId, ctx.contextId);
  }
  if (ctx.callerThreadId) {
    requestContext.set(GRAPH_RUN_CONTEXT.callerThreadId, ctx.callerThreadId);
  }
  if (ctx.deskAgentId) {
    requestContext.set(GRAPH_RUN_CONTEXT.deskAgentId, ctx.deskAgentId);
  }
  if (ctx.taskId) {
    requestContext.set(GRAPH_RUN_CONTEXT.taskId, ctx.taskId);
  }
  if (ctx.routineId) {
    requestContext.set(GRAPH_RUN_CONTEXT.routineId, ctx.routineId);
  }
  if (ctx.approvalPolicy) {
    requestContext.set(GRAPH_RUN_CONTEXT.approvalPolicy, ctx.approvalPolicy);
  }
  if (ctx.userId) {
    requestContext.set(GRAPH_RUN_CONTEXT.userId, ctx.userId);
  }
  if (ctx.approvalGrants?.length) {
    requestContext.set(GRAPH_RUN_CONTEXT.approvalGrants, [
      ...ctx.approvalGrants,
    ]);
  }
  if (ctx.allowedToolIds) {
    requestContext.set(GRAPH_RUN_CONTEXT.allowedToolIds, [
      ...ctx.allowedToolIds,
    ]);
  }
  if (ctx.space !== undefined) {
    requestContext.set(GRAPH_RUN_CONTEXT.space, serializeGraphSpace(ctx.space));
  }
  return requestContext;
}

/**
 * Pin a Space onto the graph run before it starts. Callers that already
 * resolved one win; otherwise inherit the ALS (invoke_workflow from chat) and
 * then the action thread. Missing both is intentional tenant-global — never a
 * conversion of an unresolved claim.
 */
export async function withGraphRunSpace(
  ctx: GraphRunContext
): Promise<GraphRunContext> {
  if (ctx.space !== undefined) {
    return ctx;
  }
  const alsSpace = getEngentyToolsRunContext().space;
  if (alsSpace !== undefined) {
    return { ...ctx, space: alsSpace };
  }
  const store = createThreadStoreFromEnv();
  if (!(store && ctx.threadId.trim())) {
    return { ...ctx, space: null };
  }
  const resolution = await resolveRunSpaceForThread({
    scope: {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? "",
    },
    store,
    threadId: ctx.threadId,
    runId: ctx.requestId,
  });
  return { ...ctx, space: toolsSpaceFromResolution(resolution) };
}

/**
 * Build the isolated Mastra a graph run executes on: our primitives, the shared
 * pg snapshot store, nothing else. No agents, no tenant workflows, no way for a
 * graph to reach anything it wasn't given.
 */
// One store for the whole process, not one per graph run.
//
// `rehydrateGraphVersion` runs on every start, resume and dry-run, and each
// `PostgresStore` owns its OWN pg pool — so a fresh one per dispatch leaked a
// pool per graph run and, before `disableInit`, replayed Mastra's DDL each time
// (which reloads PostgREST's schema cache; see mastra-storage.ts). The store is
// stateless across runs, so sharing it is safe.
let graphStorage: ReturnType<typeof createEngentyMastraStorage> | undefined;
let graphStorageResolved = false;

function getGraphStorage(): ReturnType<typeof createEngentyMastraStorage> {
  if (!graphStorageResolved) {
    graphStorage = createEngentyMastraStorage();
    graphStorageResolved = true;
  }
  return graphStorage;
}

function createGraphMastra(): Mastra {
  const storage = getGraphStorage();
  return new Mastra({
    ...(storage ? { storage } : {}),
    tools: createGraphActionPrimitives(),
  });
}

/**
 * Rehydrate a stored version into a runnable workflow.
 *
 * NOTE: `rehydrateWorkflow` returns `{ workflow }` deliberately — `Workflow` has
 * a `.then()` builder method, so returning one from an async function makes the
 * runtime treat it as a thenable and the call hangs forever. Always destructure.
 */
export async function rehydrateGraphVersion(version: WorkflowVersionRow) {
  const mastra = createGraphMastra();
  const stored = version.graph as Record<string, unknown>;
  const def = {
    ...stored,
    // Pin the runtime id to the version so a suspended run's snapshot resolves
    // back to exactly the graph it started on, never an edited one.
    id: graphWorkflowId(version),
  };
  const { workflow } = await rehydrateWorkflow(def as never, mastra);
  mastra.addWorkflow(workflow);
  return { mastra, workflow };
}

export interface StartGraphRunInput {
  ctx: GraphRunContext;
  input: Record<string, unknown>;
  runId: string;
  version: WorkflowVersionRow;
}

export interface GraphRunOutcome {
  /** Present when the run suspended at a gate — drives the inbox card. */
  gate?: {
    kind?: string;
    payload?: Record<string, unknown>;
    stepId: string;
    title?: string;
  };
  reason?: string;
  result?: unknown;
  status: "success" | "suspended" | "failed" | "sleeping";
  /** When a sleep/sleepUntil node parked the run. */
  wakeAt?: string;
}

/**
 * Normalize a gate's suspend payload for the approval card.
 *
 * The gate suspends with `{ kind, title, payload, request_id, context_* }` —
 * the envelope. Only the inner `payload` is the thing a human is deciding
 * about. Handing the envelope to the card renders "kind: field_updates" and a
 * request UUID instead of "€4,800.00 → billing@acme.com", which defeats the
 * whole point of showing the actual effect.
 */
function readGate(
  stepId: string,
  suspendPayload: unknown
): GraphRunOutcome["gate"] {
  const envelope = (suspendPayload ?? {}) as Record<string, unknown>;
  const inner = envelope.payload;
  return {
    stepId,
    ...(typeof envelope.kind === "string" ? { kind: envelope.kind } : {}),
    ...(typeof envelope.title === "string" ? { title: envelope.title } : {}),
    payload:
      inner && typeof inner === "object"
        ? (inner as Record<string, unknown>)
        : {},
  };
}

/** Normalize a Mastra workflow result into the shape the run record wants. */
function toOutcome(result: unknown): GraphRunOutcome {
  const status = (result as { status?: string })?.status;
  if (status === "waiting") {
    // A sleep / sleepUntil node parked the run. Distinct from `suspended`:
    // nobody is being asked for anything, so it must not surface in the inbox
    // as an outstanding decision.
    const steps = (result as { steps?: Record<string, unknown> }).steps ?? {};
    let wakeAt: string | undefined;
    for (const step of Object.values(steps)) {
      const state = step as { status?: string; payload?: { date?: unknown } };
      if (state.status === "waiting" && state.payload?.date) {
        wakeAt = new Date(state.payload.date as string | number).toISOString();
        break;
      }
    }
    return { status: "sleeping", ...(wakeAt ? { wakeAt } : {}) };
  }
  if (status === "suspended") {
    const steps = (result as { steps?: Record<string, unknown> }).steps ?? {};
    for (const [stepId, step] of Object.entries(steps)) {
      const state = step as { status?: string; suspendPayload?: unknown };
      if (state.status === "suspended") {
        return {
          gate: readGate(stepId, state.suspendPayload),
          status: "suspended",
        };
      }
    }
    return { status: "suspended" };
  }
  if (status === "success") {
    return {
      result: (result as { result?: unknown }).result,
      status: "success",
    };
  }
  const error = (result as { error?: unknown }).error;
  return {
    status: "failed",
    reason: readErrorReason(error) ?? "graph run failed",
  };
}

/**
 * Dig a human-readable reason out of whatever shape the engine hands back.
 *
 * A failed step's error is often an OBJECT (`{ message }`, or a step-keyed
 * map of them) rather than an Error or a string — and every one of those used
 * to collapse to the string "graph run failed", which told the owner nothing.
 * "specialist bookkeeping.mail-collector failed — unknownAgentType" is the
 * difference between a report someone can act on and a shrug.
 */
function readErrorReason(error: unknown, depth = 0): string | null {
  if (depth > 3 || error == null) {
    return null;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error.trim() || null;
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    const direct =
      readErrorReason(record.message, depth + 1) ??
      readErrorReason(record.error, depth + 1) ??
      readErrorReason(record.cause, depth + 1);
    if (direct) {
      return direct;
    }
    // A step-keyed error map: take the first step's reason and name the step.
    for (const [key, value] of Object.entries(record)) {
      const nested = readErrorReason(value, depth + 1);
      if (nested) {
        return `${key}: ${nested}`;
      }
    }
  }
  return null;
}

/** Start a graph run and settle it (suspends count as settled). */
export async function startGraphRun(
  input: StartGraphRunInput
): Promise<GraphRunOutcome> {
  const ctx = await withGraphRunSpace(input.ctx);
  const { workflow } = await rehydrateGraphVersion(input.version);
  const run = await workflow.createRun({ runId: input.runId });
  const unwatch = await watchGraphRunEvents(run, {
    runId: input.runId,
    tenantId: ctx.tenantId,
    threadId: ctx.threadId,
  });
  try {
    const result = await run.start({
      inputData: input.input,
      requestContext: buildGraphRequestContext(ctx),
    });
    return toOutcome(result);
  } finally {
    unwatch();
  }
}

/** Per-node state for the monitor canvas. Keyed by stored entry id. */
export type GraphNodeState =
  | "idle"
  | "running"
  | "done"
  | "waiting-approval"
  | "sleeping"
  | "failed"
  | "skipped";

export interface GraphRunSnapshot {
  /**
   * The runs a `run_specialist` node started — the agent's own transcript,
   * where its streamed text and any updates it proposed live.
   *
   * A specialist runs as a CHILD run with its own id, so from the outside a
   * flow that had an agent do the work looks like it did nothing: the parent
   * run carries the node states and nothing else. Surfacing the child ids is
   * what lets a task show what its agent actually said and asked for.
   */
  agentRuns: { runId: string; stepId: string; threadId?: string }[];
  /** The suspended gate, when the run is waiting on a human. */
  gate?: GraphRunOutcome["gate"];
  nodes: Record<string, { detail?: string; state: GraphNodeState }>;
  status: string;
}

/** `run_specialist`'s envelope, when this step produced one. */
function agentRunFromStep(
  stepId: string,
  step: { output?: unknown }
): GraphRunSnapshot["agentRuns"][number] | null {
  const output = step.output;
  if (!output || typeof output !== "object") {
    return null;
  }
  const { run_id: runId, thread_id: threadId } = output as {
    run_id?: unknown;
    thread_id?: unknown;
  };
  if (typeof runId !== "string" || !runId.trim()) {
    return null;
  }
  return {
    runId,
    stepId,
    ...(typeof threadId === "string" && threadId ? { threadId } : {}),
  };
}

/** Map a Mastra step status onto the canvas vocabulary. */
function nodeStateFor(
  stepId: string,
  step: { status?: string; suspendPayload?: unknown; payload?: unknown }
): { detail?: string; state: GraphNodeState } {
  switch (step.status) {
    case "success":
      return { state: "done" };
    case "running":
      return { state: "running" };
    case "failed":
      return { state: "failed" };
    case "suspended":
      // Only a gate can suspend, so a suspended step is always a human wait.
      return { state: "waiting-approval" };
    case "waiting": {
      const date = (step.payload as { date?: unknown } | undefined)?.date;
      return {
        state: "sleeping",
        ...(date
          ? { detail: `wakes ${new Date(date as string).toLocaleString()}` }
          : {}),
      };
    }
    case "skipped":
      return { state: "skipped" };
    default:
      void stepId;
      return { state: "idle" };
  }
}

/**
 * Read a run's current shape for the monitor canvas. Rehydrates the pinned
 * version because the run's state is stored against that workflow id — the same
 * reason resume works after a restart.
 */
export async function readGraphRunSnapshot(input: {
  runId: string;
  version: WorkflowVersionRow;
}): Promise<GraphRunSnapshot | null> {
  const { workflow } = await rehydrateGraphVersion(input.version);
  const state = await workflow.getWorkflowRunById(input.runId);
  if (!state) {
    return null;
  }
  const steps = (state as { steps?: Record<string, unknown> }).steps ?? {};
  const nodes: GraphRunSnapshot["nodes"] = {};
  const agentRuns: GraphRunSnapshot["agentRuns"] = [];
  let gate: GraphRunOutcome["gate"] | undefined;
  for (const [stepId, raw] of Object.entries(steps)) {
    const step = raw as {
      output?: unknown;
      status?: string;
      suspendPayload?: Record<string, unknown>;
    };
    nodes[stepId] = nodeStateFor(stepId, step);
    if (step.status === "suspended") {
      gate = readGate(stepId, step.suspendPayload);
    }
    const agentRun = agentRunFromStep(stepId, step);
    if (agentRun) {
      agentRuns.push(agentRun);
    }
  }
  return {
    agentRuns,
    ...(gate ? { gate } : {}),
    nodes,
    status: (state as { status?: string }).status ?? "unknown",
  };
}

export interface ResumeGraphRunInput {
  ctx: GraphRunContext;
  resumeData: Record<string, unknown>;
  runId: string;
  /** Suspended step id. Omit to let Mastra pick the only suspended step. */
  stepId?: string;
  version: WorkflowVersionRow;
}

/** Resume a suspended graph run with a human decision. */
export async function resumeGraphRun(
  input: ResumeGraphRunInput
): Promise<GraphRunOutcome> {
  const ctx = await withGraphRunSpace(input.ctx);
  const { workflow } = await rehydrateGraphVersion(input.version);
  const run = await workflow.createRun({ runId: input.runId });
  const unwatch = await watchGraphRunEvents(run, {
    runId: input.runId,
    tenantId: ctx.tenantId,
    threadId: ctx.threadId,
  });
  try {
    const result = await run.resume({
      resumeData: input.resumeData,
      requestContext: buildGraphRequestContext(ctx),
      ...(input.stepId ? { step: input.stepId } : {}),
    });
    return toOutcome(result);
  } finally {
    unwatch();
  }
}
