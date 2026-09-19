// Map a suspended/artifact tool signal to an AG-UI interrupt the chat client can
// render. Shared by the conversation executor (start) and its resume leg.
//
// - A native frontend tool suspends the run (it calls `ctx.agent.suspend()` in
//   `execute`); the suspend surfaces as a `tool_suspended` event. We persist the open
//   interrupt (keyed by the suspended run id so the resume reattaches) and emit a
//   RUN_FINISHED whose `outcome` tells the client which tool call is suspended.
// - A decision/feedback artifact reaches us one of two ways. `requestDecision`
//   SUSPENDS and hands its artifact over as the suspend payload; `requestFeedback`
//   (and any run that cannot service an interrupt) still returns it as a tool
//   RESULT. Either way we persist the open interrupt and emit RUN_FINISHED with the
//   interrupt outcome so the chat shows the interactive picker/form (not a
//   "submitted" final state).
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
  type NotifyThreadInterruptInput,
  notifyThreadInterrupt,
} from "../../notifications/thread-interrupts.js";
import {
  AG_UI_OPEN_INTERRUPT_METADATA_KEY,
  buildAgUiOpenInterruptValue,
  buildFrontendToolOpenInterruptFromPayload,
  buildSessionInterruptOutcome,
  type FrontendToolInterruptPayload,
  type SessionInterruptPayload,
} from "../sessions/interrupts.js";
import {
  isDecisionArtifactPayload,
  isFeedbackArtifactPayload,
} from "../sessions/transcript.js";
import type { AiSessionScope } from "../sessions/types.js";

/**
 * Every emit site persists the open interrupt AND files its notification:
 * the card is a decision the people of the thread can answer, so it gets a
 * row like every other parked run (thread-interrupts.ts). `getAgentConfig`
 * tells the audience rule whether the agent is shared.
 */
type InterruptNotifyDeps = Pick<NotifyThreadInterruptInput, "getAgentConfig">;

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
  /**
   * The effort tier this run resolved to, persisted so the resume re-derives
   * the same model instead of falling through to the `chat` purpose.
   */
  effort?: AgUiOpenInterruptMetadata["effort"] | null;
  emit: (event: AGUIEvent) => void;
  getAgentConfig?: InterruptNotifyDeps["getAgentConfig"];
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
  const open: AgUiOpenInterruptMetadata = {
    ...buildFrontendToolOpenInterruptFromPayload(interrupt),
    ...(input.effort ? { effort: input.effort } : {}),
  };
  try {
    await input.store.mergeThreadMetadataForUser({
      patch: {
        [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: buildAgUiOpenInterruptValue(open),
      },
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
  await notifyThreadInterrupt({
    ...(input.getAgentConfig ? { getAgentConfig: input.getAgentConfig } : {}),
    interruptId: interrupt.interruptId,
    kind: "tool_approval",
    runId: input.resumeRunId,
    scope: input.scope,
    store: input.store,
    threadId: input.threadId,
    title: interrupt.title,
  });
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
  /**
   * The effort tier this run resolved to, persisted so the resume re-derives
   * the same model instead of falling through to the `chat` purpose.
   */
  effort?: AgUiOpenInterruptMetadata["effort"] | null;
  emit: (event: AGUIEvent) => void;
  getAgentConfig?: InterruptNotifyDeps["getAgentConfig"];
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
    // Bulk pre-approval (engenty_tools_preapprove): one card covering several
    // operations — the ids ride the artifact id so approving grants each, and
    // the agent's plan summary becomes the card body.
    ...(input.payload.operation_ids?.length
      ? { operationIds: input.payload.operation_ids }
      : {}),
    ...(input.payload.body ? { body: input.payload.body } : {}),
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
    ...(input.effort ? { effort: input.effort } : {}),
    run_id: input.resumeRunId,
  };
  // The persisted open interrupt is what the resume route validates and routes
  // by — if this write fails, the interrupt is NOT resumable, so fail the run
  // loudly (the caller emits RUN_ERROR) instead of emitting an approval card
  // whose answer can never be applied.
  await input.store.mergeThreadMetadataForUser({
    patch: {
      [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: buildAgUiOpenInterruptValue(open),
    },
    tenantId: input.scope.tenantId,
    threadId: input.threadId,
    userId: input.scope.userId,
  });
  // A gate core already filed a request for has its row: the package turns
  // `approval.requested` into one decidable-in-place record, and deciding it
  // there or here is the same decision. Only a gate with no request behind
  // it (a workspace tool, a bulk pre-approval) needs the thread's own row.
  if (!input.payload.approval_request_id) {
    await notifyThreadInterrupt({
      ...(input.getAgentConfig ? { getAgentConfig: input.getAgentConfig } : {}),
      interruptId: interrupt.interruptId,
      kind: "tool_approval",
      runId: input.resumeRunId,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
      title: artifact.title,
    });
  }
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
      ...((a as { multi_select?: unknown }).multi_select === true
        ? { multi_select: true }
        : {}),
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
 * Hire / revision artifacts already filed `agent_proposed` on propose. A
 * second `agent_question` row for the same card would double the badge and
 * vanish when the interrupt clears while the proposal is still pending.
 */
export function decisionArtifactHasDurableInbox(result: unknown): boolean {
  return (
    !!result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    (result as { durable_inbox?: unknown }).durable_inbox === true
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
  /**
   * The effort tier this run resolved to, persisted so the resume re-derives
   * the same model instead of falling through to the `chat` purpose.
   */
  effort?: AgUiOpenInterruptMetadata["effort"] | null;
  emit: (event: AGUIEvent) => void;
  getAgentConfig?: InterruptNotifyDeps["getAgentConfig"];
  result: unknown;
  /**
   * Set when the artifact came from a native SUSPEND (requestDecision) rather
   * than a tool result: it makes the persisted interrupt a PARKED one, which is
   * how the resume route knows to continue this run in place instead of
   * re-running the turn. Omitted for the artifact paths that still re-run
   * (tool-approval cards, requestFeedback).
   */
  resumeRunId?: string;
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
  const open: AgUiOpenInterruptMetadata = {
    ...artifactOpenInterrupt(interrupt),
    ...(input.effort ? { effort: input.effort } : {}),
    ...(input.resumeRunId ? { run_id: input.resumeRunId } : {}),
  };
  try {
    await input.store.mergeThreadMetadataForUser({
      patch: {
        [AG_UI_OPEN_INTERRUPT_METADATA_KEY]: buildAgUiOpenInterruptValue(open),
      },
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
  if (!decisionArtifactHasDurableInbox(input.result)) {
    await notifyThreadInterrupt({
      ...(input.getAgentConfig ? { getAgentConfig: input.getAgentConfig } : {}),
      interruptId: interrupt.interruptId,
      kind: "agent_question",
      runId: input.resumeRunId ?? null,
      scope: input.scope,
      store: input.store,
      threadId: input.threadId,
      title: interrupt.artifact.title,
    });
  }
  // The card's CONTENT only reaches a live client through this event. The
  // RUN_FINISHED outcome carries an id and a title, not the choices, and the
  // transcript fallback (`pendingInterruptFromTranscript`) reads the artifact
  // off the tool RESULT — which a natively-suspended `requestDecision` never
  // produces. Without this the chat shows a spinning "Decision needed" row and
  // no chooser until (and unless) a session-metadata refetch lands.
  emitOpenInterruptEvent(input.emit, open);
  input.emit({
    outcome: buildSessionInterruptOutcome(interrupt),
    runId: input.busRunId,
    threadId: input.threadId,
    type: EventType.RUN_FINISHED,
  } as never);
  return true;
}
