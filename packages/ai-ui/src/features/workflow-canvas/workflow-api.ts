// Action Canvas ↔ /ai/v1/workflows.
import { requestAiServiceJson } from "../../lib/runtime/ai-service-client.js";
import type { StoredGraph } from "./graph-model.js";

export type WorkflowStatus = "draft" | "active" | "disabled";

export interface WorkflowDto {
  context_type: string | null;
  created_at: string;
  current_version: number | null;
  description: string | null;
  id: string;
  module_id: string | null;
  name: string;
  /** Owning specialist; null = library (the shared subset). */
  owner_agent_id?: string | null;
  /** Module workflow this row reconciles from; null on an authored flow. */
  source_workflow_id?: string | null;
  status: WorkflowStatus;
  /** Display title generated at save; `name` stays the stable key. */
  title?: string | null;
  updated_at: string;
}

export interface WorkflowVersionDto {
  allowed_tools: string[] | null;
  approved_at: string | null;
  authored_by: "user" | "copilot" | "system";
  created_at: string;
  graph: StoredGraph;
  id: string;
  version: number;
  workflow_id: string;
}

/** Mirrors `GraphValidationIssue` on the server — codes are the contract. */
export interface GraphIssueDto {
  code: string;
  entryId?: string;
  message: string;
  path: string;
}

const BASE = "/ai/v1/workflows";

/** Generous: a draft plus one repair round is two full model turns. */
const DRAFT_TIMEOUT_MS = 600_000;

export function listWorkflows(
  contextType?: string | null,
  signal?: AbortSignal
): Promise<{ graphs: WorkflowDto[] }> {
  const query = contextType
    ? `?context_type=${encodeURIComponent(contextType)}`
    : "";
  return requestAiServiceJson(`${BASE}${query}`, { signal });
}

export function getWorkflow(
  id: string,
  signal?: AbortSignal
): Promise<{ graph: WorkflowDto; versions: WorkflowVersionDto[] }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}`, { signal });
}

export function createWorkflow(input: {
  context_type?: string | null;
  description?: string | null;
  name: string;
}): Promise<{ graph: WorkflowDto }> {
  return requestAiServiceJson(BASE, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

/**
 * Create + author in one call. Slow by nature — a model is drawing the flow —
 * so callers should show real progress rather than a spinner with no story.
 *
 * `issues` may be non-empty on success: a flow with problems marked on its
 * nodes still beats no flow, and the canvas is where they get fixed.
 */
export function draftWorkflow(input: {
  context_type?: string | null;
  description: string;
  name: string;
  /**
   * Client-minted UUID for the first drafting round. Attach
   * `GET /ai/v1/runs/:id/stream` with it to watch the draft being written —
   * the response below takes minutes, so this is the only live signal.
   */
  run_id?: string;
}): Promise<{
  /** The chat tier drafted — no planning tier is bound in AI settings. */
  drafted_with_fallback_tier?: boolean;
  graph: WorkflowDto;
  issues: GraphIssueDto[];
  version: WorkflowVersionDto;
}> {
  return requestAiServiceJson(`${BASE}/draft`, {
    body: JSON.stringify(input),
    method: "POST",
    // The shared client aborts at 15s, which is far shorter than a model takes
    // to design a flow. Without this the client gives up while the server is
    // still working, reports "lost connection", and the flow appears anyway a
    // minute later — the worst of both: a failure message and a duplicate.
    //
    // The ceiling has to cover TWO rounds on the planning-tier model, not one.
    // Measured on deepseek-v4-pro: 4m26s for the first draft plus 1m15s for the
    // repair round — 5m41s end to end, which sailed past the old 4-minute
    // ceiling and reproduced exactly the failure this signal exists to prevent.
    signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
  });
}

/**
 * One AI repair round against a stored version, behind the "N to fix" badge.
 * `improved: false` means nothing got better and NO version was saved — the
 * caller should suggest a different instruction rather than celebrate.
 */
export function repairWorkflow(
  id: string,
  input: {
    instruction?: string;
    /** Client-minted UUID — attach `GET /ai/v1/runs/:id/stream` to watch. */
    run_id?: string;
    version_id: string;
  }
): Promise<
  | { improved: true; issues: GraphIssueDto[]; version: WorkflowVersionDto }
  | { improved: false; issues: GraphIssueDto[] }
> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}/repair`, {
    body: JSON.stringify(input),
    method: "POST",
    // Same reasoning as /draft: a model round takes minutes, the shared
    // client aborts at 15s.
    signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
  });
}

export function updateWorkflow(
  id: string,
  input: {
    context_type?: string | null;
    description?: string | null;
    name?: string;
  }
): Promise<{ graph: WorkflowDto }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}`, {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function deleteWorkflow(id: string): Promise<{ ok: true }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Preflight — never saves. Powers the live problem badges on the canvas. */
export function validateWorkflow(
  graph: StoredGraph,
  signal?: AbortSignal
): Promise<{ issues: GraphIssueDto[]; valid: boolean }> {
  return requestAiServiceJson(`${BASE}/validate`, {
    body: JSON.stringify({ graph }),
    method: "POST",
    signal,
  });
}

export function saveWorkflowVersion(
  id: string,
  input: {
    allowed_tools?: string[] | null;
    authored_by?: "user" | "copilot";
    graph: StoredGraph;
  }
): Promise<{ version: WorkflowVersionDto }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}/versions`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

/**
 * Compile a module workflow into its stored graph and hand back the graph id — no run.
 *
 * Lives here rather than under a separate client because what comes back IS a
 * stored graph: the caller's next move is always to use the graph id. Idempotent, so a
 * picker may call it every time a declared module workflow is selected.
 *
 * Concurrent calls for the same workflow share ONE request: two callers racing
 * (React dev double-mounts an effect) each made the server compile, and the
 * fresh graph got two identical versions a few hundred ms apart.
 */
export interface MaterializedWorkflow {
  name: string;
  version: number;
  workflow_id: string;
}

const resolveInFlight = new Map<string, Promise<MaterializedWorkflow>>();

/**
 * The tenant flow a module workflow reconciled into. Read-only: the boot
 * reconcile is what materializes rows; a 409 means it has not run yet.
 */
export function materializeWorkflow(
  workflowId: string
): Promise<MaterializedWorkflow> {
  const running = resolveInFlight.get(workflowId);
  if (running) {
    return running;
  }
  const request = requestAiServiceJson<MaterializedWorkflow>(
    `/ai/v1/workflows/by-source/${encodeURIComponent(workflowId)}/materialize`,
    { method: "POST" }
  ).finally(() => {
    resolveInFlight.delete(workflowId);
  });
  resolveInFlight.set(workflowId, request);
  return request;
}

export function publishWorkflowVersion(
  id: string,
  versionId: string
): Promise<{ graph: WorkflowDto; version: WorkflowVersionDto }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}/publish`, {
    body: JSON.stringify({ version_id: versionId }),
    method: "POST",
  });
}

export function runWorkflow(
  id: string,
  input: {
    context?: { id?: string; type?: string };
    input?: Record<string, unknown>;
  }
): Promise<{
  deduped?: boolean;
  request_id?: string;
  run_id: string;
  thread_id: string;
}> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}/run`, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function resumeWorkflowRun(
  runId: string,
  input: {
    approved: boolean;
    data?: Record<string, unknown>;
    reason?: string;
    step_id?: string;
  }
): Promise<{ ok: true; outcome: { status: string } }> {
  return requestAiServiceJson(
    `${BASE}/runs/${encodeURIComponent(runId)}/resume`,
    { body: JSON.stringify(input), method: "POST" }
  );
}

/** The owner looked at a held run (routine `report: ask`) — finish it. */
export function reviewWorkflowRun(
  runId: string
): Promise<{ ok: true; result: "released" | "not_held" }> {
  return requestAiServiceJson(
    `${BASE}/runs/${encodeURIComponent(runId)}/review`,
    { body: "{}", method: "POST" }
  );
}

export interface WorkflowRunDto {
  context_id: string | null;
  context_type: string | null;
  created_at: string;
  id: string;
  reason: string | null;
  run_id: string | null;
  status: string;
  updated_at: string;
  wake_at?: string | null;
  workflow_version_id?: string | null;
}

export interface GraphRunSnapshotDto {
  /**
   * Runs started by the flow's agent nodes. A specialist runs as its own child
   * run, so its transcript — and anything it proposed — lives there, not on the
   * flow's run.
   */
  agentRuns?: { runId: string; stepId: string; threadId?: string }[];
  gate?: {
    kind?: string;
    payload?: Record<string, unknown>;
    stepId: string;
    title?: string;
  };
  nodes: Record<
    string,
    {
      detail?: string;
      state:
        | "idle"
        | "running"
        | "done"
        | "waiting-approval"
        | "sleeping"
        | "failed"
        | "skipped";
    }
  >;
  status: string;
}

export function listWorkflowRuns(
  id: string,
  signal?: AbortSignal
): Promise<{ runs: WorkflowRunDto[] }> {
  return requestAiServiceJson(`${BASE}/${encodeURIComponent(id)}/runs`, {
    signal,
  });
}

export function getWorkflowRun(
  runId: string,
  signal?: AbortSignal
): Promise<{
  request: WorkflowRunDto;
  snapshot: GraphRunSnapshotDto | null;
  version: WorkflowVersionDto;
}> {
  return requestAiServiceJson(`${BASE}/runs/${encodeURIComponent(runId)}`, {
    signal,
  });
}

/**
 * Re-read every module's shipped workflow file and republish what drifted.
 *
 * A bundled workflow lives in the module's source tree, so an edit there
 * reaches the app only when this pass runs — otherwise at the next AI-app
 * boot. The endpoint is the boot reconcile itself, so it covers every
 * workflow of the tenant, not just the one being looked at.
 */
export function reconcileModuleWorkflows(): Promise<{ ok: boolean }> {
  return requestAiServiceJson<{ ok: boolean }>("/ai/v1/routines/reconcile", {
    method: "POST",
  });
}
