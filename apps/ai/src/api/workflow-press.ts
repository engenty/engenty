// Pressing a Workflow button = dispatching a subject-bound run. Nothing else.
//
// A press is an INVOCATION, not a work item: it provisions nothing, creates no
// Task, and leaves `workflow_run.owner_task_id` null —
// the state the schema documents for button-started runs. Tasks are defined
// pieces of work assigned to a person or an agent; a person clicking "Enhance
// contact" on a record is asking for a run about THAT record, now.
//
// History, so the old shape does not come back: on 17 Aug the press was
// converged onto trigger → task to give its approvals a home, when every fire
// still minted a fresh task — per-press isolation held. On 23 Aug routines
// became standing tasks and fires started WAKING one task instead of creating
// one; the press rode the same rail and silently inherited standing-task
// semantics — one shared work record per action, the subject dropped (manual
// fires never read `contexts`), concurrent presses skipped. The fix is not a
// better task shape but no task at all: the shared dispatcher binds the
// subject into the run context (where `run_specialist` reads it), dedupes per
// subject, and keeps the run durable — gates suspend the run and are answered
// from the run view, exactly as canvas-started runs always were.

import type { WorkflowDefinition } from "@engenty/ai-core";
import { createLogger } from "@engenty/telemetry";
import type { Mastra } from "@mastra/core/mastra";
import { createWorkflowStoreFromEnv } from "../ai/index.js";
import { checkWorkflowFireGate } from "../ai/routines/trigger-gate.js";
import {
  resolveRunSpaceById,
  toolsSpaceFromResolution,
} from "../ai/sessions/run-space.js";
import type { AiSessionScope } from "../ai/sessions/types.js";
import { dispatchPublishedWorkflowRun } from "../ai/workflows/dispatch-published-run.js";

const logger = createLogger({ name: "action-press" });

/**
 * The press was refused before any run existed — the wire answers 409 with
 * the code and the reason, so the person sees why instead of an internal
 * error while the reason goes to a log they never open.
 */
export class WorkflowPressRefusedError extends Error {
  readonly code: "action_flow_not_materialized" | "workflow_not_pressable";
  readonly reason: string;
  readonly workflowId: string;

  constructor(input: {
    code: WorkflowPressRefusedError["code"];
    reason: string;
    workflowId: string;
  }) {
    super(`action "${input.workflowId}" refused: ${input.reason}`);
    this.name = "WorkflowPressRefusedError";
    this.code = input.code;
    this.reason = input.reason;
    this.workflowId = input.workflowId;
  }
}

export interface WorkflowPressResult {
  /** True when an in-flight run for this subject answered instead of a new one. */
  deduped: boolean;
  requestId: string;
  /** The run to watch — always present; deduped presses return the existing one. */
  runId: string;
  threadId: string;
}

export async function pressWorkflow(input: {
  action: WorkflowDefinition;
  context: { contextId: string | null; contextType: string | null };
  idempotencyKey?: string;
  input: Record<string, unknown>;
  mastra: Mastra;
  scope: AiSessionScope;
  spaceId?: string | null;
  /** A slash command is a press with a different caller label. */
  trigger?: "button" | "command";
}): Promise<WorkflowPressResult> {
  const { action, context, scope } = input;
  const store = createWorkflowStoreFromEnv();
  if (!store) {
    throw new Error("action press: action graph storage is unconfigured");
  }

  // A press in a Space runs against that Space's surface — resolve it here,
  // where the claim arrives, so the run's tools see the mounted modules and
  // roster. No claim = tenant-global (the app-host/API case); an unresolved
  // claim rides through as the refusal context so every module tool refuses
  // with `space_context_unresolved` instead of silently widening to global.
  const spaceId = input.spaceId?.trim() || null;
  const space = spaceId
    ? toolsSpaceFromResolution(await resolveRunSpaceById({ scope, spaceId }))
    : null;

  // Ensure-on-use is gone: module workflows exist from reconcile, so a press
  // references a published version or refuses. A missing row means the
  // reconcile has not run (or failed) — say that, do not materialize here.
  const existing = await store.findBySourceWorkflow({
    sourceWorkflowId: action.id,
    tenantId: scope.tenantId,
  });
  const current = existing
    ? await store.getCurrent({ id: existing.id, tenantId: scope.tenantId })
    : null;
  if (!current) {
    logger.warn("press refused — no published flow for action", {
      workflowId: action.id,
      tenantId: scope.tenantId,
    });
    throw new WorkflowPressRefusedError({
      code: "action_flow_not_materialized",
      reason:
        "This workflow has no published version in this tenant yet — the module workflow reconcile has not materialized it.",
      workflowId: action.id,
    });
  }

  // The manual-trigger door: a person may press only what a routine's enabled
  // `manual` trigger opens. Every wrapped workflow carries one by default;
  // turning it off is how an owner actually closes the button.
  const gate = await checkWorkflowFireGate({
    kind: "manual",
    tenantId: scope.tenantId,
    workflowId: current.graph.id,
  });
  if (!gate.allowed) {
    throw new WorkflowPressRefusedError({
      code: "workflow_not_pressable",
      reason: gate.reason ?? "Its routine has no enabled manual trigger.",
      workflowId: action.id,
    });
  }

  return dispatchPublishedWorkflowRun({
    // Filed under the module workflow id, matching the per-subject dedup the
    // single-agent lane always keyed on.
    workflowId: action.id,
    context,
    current,
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    input: input.input,
    scope,
    space,
    spaceId,
    trigger: input.trigger ?? "button",
  });
}
