// Map a suspended/artifact tool signal to an AG-UI interrupt the chat client can
// render. Shared by the conversation executor (start) and its resume leg.
//
// - A native frontend tool suspends the run (it calls `ctx.agent.suspend()` in
//   `execute`); the suspend surfaces as a `tool_suspended` event. We persist the open
//   interrupt (keyed by the suspended run id so the resume reattaches) and emit a
//   RUN_FINISHED whose `outcome` tells the client which tool call is suspended.
// - A decision/feedback artifact arrives as a tool RESULT (not a suspend): the tool
//   returns the artifact and the run would otherwise keep talking. We persist the open
//   interrupt and emit RUN_FINISHED with the interrupt outcome so the chat shows the
//   interactive picker/form (not a "submitted" final state).
import type {
  AGUIEvent,
  AgUiOpenInterruptMetadata,
  FrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import { ENGENTY_OPEN_INTERRUPT_EVENT, EventType } from "@engenty/ag-ui-bridge";
import {
  buildToolApprovalArtifact,
  type ToolApprovalSuspendPayload,
} from "../../../ai/tools/engenty-tools/index.js";
import type { ThreadStore } from "../../dal/threads/index.js";
import {
  buildFrontendToolOpenInterruptFromPayload,
  buildSessionInterruptOutcome,
  type FrontendToolInterruptPayload,
  mergeAgUiOpenInterruptMetadata,
  type SessionInterruptPayload,
} from "../sessions/interrupts.js";
import {
  isDecisionArtifactPayload,
  isFeedbackArtifactPayload,
} from "../sessions/transcript.js";
import type { AiSessionScope } from "../sessions/types.js";

// The RUN_FINISHED interrupt outcome schema strips unknown fields, so the full
// interrupt artifact rides a CUSTOM side-channel event; the client uses it to
// render the NEXT approval card immediately instead of re-showing the previous
// one until the lagging session-metadata refetch lands (the "same card
// re-asks" bug with parallel approval-gated tool calls).
function emitOpenInterruptEvent(
  emit: (event: AGUIEvent) => void,
  open: AgUiOpenInterruptMetadata
): void {
  emit({
    name: ENGENTY_OPEN_INTERRUPT_EVENT,
    type: EventType.CUSTOM,
    value: open,
  } as never);
}

export interface SuspendChunkPayload {
  args?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
}

/**
 * Map a frontend-tool suspend to an AG-UI interrupt: persist the open interrupt to
 * session metadata (`run_id` = the suspended run id so resume reattaches) and emit a
 * RUN_FINISHED whose `outcome` tells the client which tool call is suspended. Returns
 * true if the payload was a recognised frontend tool (caller stops + parks).
 */
export async function emitFrontendToolInterrupt(input: {
  busRunId: string;
  emit: (event: AGUIEvent) => void;
  mergedDefinitions: readonly FrontendToolDefinition[];
  payload: SuspendChunkPayload;
  // The runtime run id the resume reattaches to (the suspended run id) — persisted
  // as the open interrupt's `run_id`.
  resumeRunId: string;
  scope: AiSessionScope;
  sessionMetadata: Record<string, unknown>;
  store: ThreadStore;
  threadId: string;
}): Promise<boolean> {
  const toolName =
    typeof input.payload.toolName === "string" ? input.payload.toolName : "";
  const toolCallId =
    typeof input.payload.toolCallId === "string"
      ? input.payload.toolCallId
      : "";
  if (!(toolName && toolCallId)) {
    return false;
  }
  const def = input.mergedDefinitions.find((d) => d.name === toolName);
  if (!def) {
    return false;
  }
  const interrupt: FrontendToolInterruptPayload = {
    interruptId: toolCallId,
    kind: "frontend_tool",
    runId: input.resumeRunId,
    title: def.metadata.engenty.title ?? toolName,
    toolCallId,
    toolInput: input.payload.args as FrontendToolInterruptPayload["toolInput"],
    toolName,
  };
  const open = buildFrontendToolOpenInterruptFromPayload(interrupt);
  try {
    await input.store.updateThreadForUser({
      metadata: mergeAgUiOpenInterruptMetadata(input.sessionMetadata, open),
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
  } catch (error) {
    console.error(
      `[conversation ${input.resumeRunId}] failed to persist frontend-tool interrupt:`,
      error
    );
  }
  emitOpenInterruptEvent(input.emit, open);
  input.emit({
    outcome: buildSessionInterruptOutcome(interrupt),
    runId: input.busRunId,
    threadId: input.threadId,
    type: EventType.RUN_FINISHED,
  } as never);
  return true;
}

/**
 * Map a tool-approval SUSPEND (native Mastra HITL from `engenty_tool_execute`)
 * to an AG-UI interrupt: a decision-kind open interrupt (so the existing
 * Approve/Deny card renders it) that ALSO carries `run_id`, which routes the
 * resume to the parked session (`respondToToolSuspension`) instead of the
 * decision re-run branch. The caller parks the session.
 */
export async function emitToolApprovalInterrupt(input: {
  busRunId: string;
  emit: (event: AGUIEvent) => void;
  payload: ToolApprovalSuspendPayload;
  // The suspended run id the resume reattaches to.
  resumeRunId: string;
  scope: AiSessionScope;
  sessionMetadata: Record<string, unknown>;
  store: ThreadStore;
  threadId: string;
  toolCallId: string;
}): Promise<void> {
  const artifact = buildToolApprovalArtifact({
    operationId: input.payload.operation_id,
    requiresApproval: input.payload.requires_approval,
    riskLevel: input.payload.risk_level,
    // Grant context (secrets_reveal's secret uuid) rides in the artifact id so
    // the approve hook can persist the durable goal-scoped grant.
    ...(input.payload.secret_id
      ? { grantContext: { secret_id: input.payload.secret_id } }
      : {}),
    ...(input.payload.title ? { title: input.payload.title } : {}),
  });
  const interrupt: SessionInterruptPayload = {
    artifact,
    interruptId: artifact.interrupt_id,
    kind: "decision",
    toolCallId: input.toolCallId,
  };
  const open: AgUiOpenInterruptMetadata = {
    ...artifactOpenInterrupt(interrupt),
    run_id: input.resumeRunId,
  };
  // The persisted open interrupt is what the resume route validates and routes
  // by — if this write fails, the interrupt is NOT resumable, so fail the run
  // loudly (the caller emits RUN_ERROR) instead of emitting an approval card
  // whose answer can never be applied.
  await input.store.updateThreadForUser({
    metadata: mergeAgUiOpenInterruptMetadata(input.sessionMetadata, open),
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
    userId: input.scope.userId,
  });
  emitOpenInterruptEvent(input.emit, open);
  input.emit({
    outcome: buildSessionInterruptOutcome(interrupt),
    runId: input.busRunId,
    threadId: input.threadId,
    type: EventType.RUN_FINISHED,
  } as never);
}

/**
 * Build the open-interrupt metadata for a decision/feedback artifact, mirroring the
 * inline shape (interrupts.ts has no builder for these kinds).
 */
function artifactOpenInterrupt(
  interrupt: SessionInterruptPayload
): AgUiOpenInterruptMetadata {
  if (interrupt.kind === "decision") {
    const a = interrupt.artifact;
    return {
      artifact_id: a.artifact_id,
      kind: "decision",
      ...(typeof a.body === "string" && a.body.trim()
        ? { body: a.body.trim() }
        : {}),
      choices: a.choices,
      interrupt_id: interrupt.interruptId,
      title: a.title,
      tool_call_id: interrupt.toolCallId,
    } as AgUiOpenInterruptMetadata;
  }
  if (interrupt.kind === "feedback") {
    const a = interrupt.artifact;
    return {
      artifact_id: a.artifact_id,
      kind: "feedback",
      ...(typeof a.body === "string" && a.body.trim()
        ? { body: a.body.trim() }
        : {}),
      ...(typeof a.placeholder === "string" && a.placeholder.trim()
        ? { placeholder: a.placeholder.trim() }
        : {}),
      ...(typeof a.submit_label === "string" && a.submit_label.trim()
        ? { submit_label: a.submit_label.trim() }
        : {}),
      interrupt_id: interrupt.interruptId,
      title: a.title,
      tool_call_id: interrupt.toolCallId,
    } as AgUiOpenInterruptMetadata;
  }
  throw new Error(
    "artifactOpenInterrupt expects a decision/feedback interrupt"
  );
}

/**
 * Detect a decision/feedback artifact in a tool result, persist the open interrupt,
 * and emit RUN_FINISHED with the interrupt outcome so the chat shows the interactive
 * picker/form. The caller STOPS the run. Resume is a fresh run (no parked agent).
 * Returns true if the result was a decision/feedback artifact.
 */
export async function emitArtifactInterrupt(input: {
  busRunId: string;
  emit: (event: AGUIEvent) => void;
  result: unknown;
  scope: AiSessionScope;
  sessionMetadata: Record<string, unknown>;
  store: ThreadStore;
  threadId: string;
  toolCallId: string;
}): Promise<boolean> {
  let interrupt: SessionInterruptPayload | null = null;
  if (isDecisionArtifactPayload(input.result)) {
    interrupt = {
      artifact: input.result,
      interruptId: input.result.interrupt_id ?? input.result.artifact_id,
      kind: "decision",
      toolCallId: input.toolCallId,
    };
  } else if (isFeedbackArtifactPayload(input.result)) {
    interrupt = {
      artifact: input.result,
      interruptId: input.result.interrupt_id ?? input.result.artifact_id,
      kind: "feedback",
      toolCallId: input.toolCallId,
    };
  }
  if (!interrupt) {
    return false;
  }
  try {
    await input.store.updateThreadForUser({
      metadata: mergeAgUiOpenInterruptMetadata(
        input.sessionMetadata,
        artifactOpenInterrupt(interrupt)
      ),
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
  } catch (error) {
    console.error(
      `[conversation] failed to persist ${interrupt.kind} interrupt:`,
      error
    );
  }
  input.emit({
    outcome: buildSessionInterruptOutcome(interrupt),
    runId: input.busRunId,
    threadId: input.threadId,
    type: EventType.RUN_FINISHED,
  } as never);
  return true;
}
