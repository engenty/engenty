// Resume a run that suspended on a tool (Phase 3.2) — a browser-executed
// frontend tool or the execute tool's approval gate.
//
// Two lanes, in order:
//   1. PARKED (fast path) — reattach to the session startConversationRun kept
//      alive in-process and call `session.respondToToolSuspension({ resumeData,
//      toolCallId })`, which drives `agent.resumeStream` internally and streams
//      the continuation through the session's subscribe listener.
//   2. SNAPSHOT (crash recovery) — if the park is gone (server restart, TTL
//      expiry), continue from Mastra's workflow snapshot storage instead:
//      `listSuspendedRuns` to confirm the run is really there, then
//      `resumeStreamUntilIdle(resumeData, { runId })`, converted to AG-UI by
//      DurableAgUiConverter. See resumeFromSnapshot below.
// Only when BOTH fail is the run genuinely unrecoverable (RUN_ERROR).
//
// These are complementary, not duplicated: the park keeps the live objects (and
// their richer event stream) for the common same-process case; the snapshot lane
// exists precisely for the case the park cannot cover.
import {
  type AGUIEvent,
  EventType,
  type FrontendToolDefinition,
} from "@engenty/ag-ui-bridge";
import type { Mastra } from "@mastra/core/mastra";
import { mergeFrontendToolDefinitions } from "../../../ai/frontend-tools/catalog.js";
import {
  createNativeFrontendTools,
  type FrontendToolResumeData,
} from "../../../ai/frontend-tools/native-frontend-tool.js";
import {
  isToolApprovalSuspendPayload,
  type ToolApprovalResumeData,
} from "../../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentRunStore, ThreadStore } from "../../dal/threads/index.js";
import type { AgentSessionStatus } from "../../dal/threads/types.js";
import { resolveCoreAgentId } from "../agent-identity.js";
import { DurableAgUiConverter } from "../durable/durable-agui-bridge.js";
import { type AiRegistry, assembleDynamicAgent } from "../registry/index.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../sessions/connection-approval-grants.js";
import { mergeAgUiOpenInterruptMetadata } from "../sessions/interrupts.js";
import { resolveToolCallResultInHistory } from "../sessions/resolve-tool-call-history.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import { createSessionRunTracker } from "../sessions/run-tracking.js";
import { readToolApprovalGrants } from "../sessions/tool-approval-grants.js";
import { type AiSessionScope, scopeAccessToken } from "../sessions/types.js";
import {
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "./emit-interrupt.js";
import { SessionAgUiConverter } from "./session-agui-bridge.js";
import {
  finishParkedResume,
  isParkedResumeInFlight,
  parkSessionRun,
  takeParkedSessionRun,
} from "./session-park.js";
import { patchThreadStatus } from "./thread-status.js";

/** A second tool that suspended within the resumed continuation. */
interface SuspendedAgain {
  args: unknown;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

export interface ResumeConversationRunInput {
  // Text agent key of the session's agent (e.g. "engenty.copilot") so the
  // continuation forwards the same agent identity as the original run.
  agentId?: string;
  // The client's declared frontend tools for this resume. Only the SNAPSHOT
  // lane needs them: the parked lane's live Session still holds the toolset the
  // original run was started with, but a re-assembled agent has none — and
  // without them the continuation cannot see (or call) a browser tool, so the
  // model reports the tool as unavailable mid-conversation.
  agentUi?: { frontend_tools?: FrontendToolDefinition[] } | null;
  // Both optional and only used by the SNAPSHOT fallback below (when the park
  // is gone). The parked path needs neither — the live Session already holds an
  // assembled agent — so a caller that omits them simply loses crash recovery.
  mastra?: Mastra;
  // The new run id the client attached to for this resume POST.
  newRunId: string;
  registry?: AiRegistry;
  // The just-resolved interrupt's toolCallId (the suspended tool).
  resolvedToolCallId: string;
  // The browser's frontend-tool result, or the user's approval decision.
  resumeData: FrontendToolResumeData | ToolApprovalResumeData;
  // Durable run tracking for the continuation run (see StartConversationRunInput).
  runStore?: AgentRunStore | null;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: ThreadStore;
  // The suspended session run id (from the open interrupt's `run_id`).
  suspendedRunId: string;
  threadId: string;
}

/**
 * The engenty-tools run context both resume lanes drive the continuation inside,
 * mirroring the start executor: without it, a SECOND gated tool call in the
 * continuation (e.g. the model retrying after an error) would see no
 * approvalPolicy and be denied instead of suspending again. Grants persisted for
 * this chat (incl. a just-granted "approve once"/"always") are threaded through
 * so re-approved operations skip the gate.
 *
 * Same agent identity + goal as the original run: the re-executed gated tool
 * must hit core as the agent so a just-persisted goal grant matches.
 */
async function buildResumeToolsRunContext(input: ResumeConversationRunInput) {
  const coreAgentId = await resolveCoreAgentId(
    input.scope.tenantId,
    input.agentId
  );
  return {
    ...getEngentyToolsRunContext(),
    ...(coreAgentId ? { agentId: coreAgentId } : {}),
    approvalGrants: mergeApprovalGrants(
      readToolApprovalGrants(input.sessionMetadata ?? {}),
      await loadConnectionApprovalGrants({
        accessToken: scopeAccessToken(input.scope),
      })
    ),
    approvalPolicy: "suspend" as const,
    goalId: input.threadId,
    // Thread-scoped tools (e.g. artifacts) read the active thread from here.
    orchestratorThreadId: input.threadId,
    runId: input.newRunId,
    tenantId: input.scope.tenantId,
    userFacingThreadId: input.threadId,
    userId: input.scope.userId,
    ...(scopeAccessToken(input.scope)
      ? { accessToken: scopeAccessToken(input.scope) }
      : {}),
  };
}

/** Clear the resolved open interrupt from thread metadata (best effort). */
async function clearOpenInterrupt(
  input: ResumeConversationRunInput
): Promise<void> {
  try {
    await input.store.updateThreadForUser({
      metadata: mergeAgUiOpenInterruptMetadata(
        input.sessionMetadata ?? {},
        null
      ),
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    });
  } catch (error) {
    console.error(
      `[conversation-resume ${input.newRunId}] failed to clear interrupt:`,
      error
    );
  }
}

/**
 * Crash-recovery lane: continue a suspended run straight from Mastra's workflow
 * snapshot storage when the in-process park is gone. Complements the park
 * (which stays the fast path for same-process resumes) — it does not replace it.
 *
 * Returns false when the caller gave us no registry/mastra to assemble with, or
 * storage has no suspended snapshot for this run; the caller then reports the
 * unrecoverable error as before.
 */
async function resumeFromSnapshot(
  input: ResumeConversationRunInput,
  emit: (event: AGUIEvent) => void
): Promise<boolean> {
  if (
    !(input.registry && input.mastra && input.suspendedRunId && input.agentId)
  ) {
    return false;
  }
  const agent = await assembleDynamicAgent(input.registry, input.agentId, {
    mastra: input.mastra,
    resolveContext: {
      tenantId: input.scope.tenantId,
      threadId: input.threadId,
      userId: input.scope.userId,
    },
  });
  // Storage is the authority here: without a suspended snapshot there is
  // nothing to continue, and the resume would fail less legibly.
  //
  // Same question the thread-load reconciler asks via `hasResumableSnapshot`;
  // it is inlined here rather than shared because this path already holds the
  // assembled agent and sharing would assemble a second one.
  const { runs } = await agent.listSuspendedRuns({ threadId: input.threadId });
  if (!runs.some((run) => run.runId === input.suspendedRunId)) {
    return false;
  }

  const toolsRunContext = await buildResumeToolsRunContext(input);
  const converter = new DurableAgUiConverter();
  // Re-declare the browser's tools for the continuation. `startConversationRun`
  // does the same merge; here it must be redone because the assembled agent is
  // brand new. Without it the resumed turn answers "that tool isn't available"
  // — the run continues, but the conversation visibly degrades.
  const frontendTools = createNativeFrontendTools(
    mergeFrontendToolDefinitions(input.agentUi?.frontend_tools, {
      includeServerTools: !input.agentId.startsWith("chatbot."),
    })
  );
  await engentyToolsRunAls.run(toolsRunContext, async () => {
    // `untilIdle` keeps the outer stream open across continuations a background
    // task may trigger. (`resumeStreamUntilIdle` is the deprecated spelling.)
    const stream = await agent.resumeStream(input.resumeData, {
      ...(Object.keys(frontendTools).length > 0
        ? { clientTools: frontendTools }
        : {}),
      memory: {
        resource: input.scope.userId,
        thread: input.threadId,
      },
      runId: input.suspendedRunId,
      untilIdle: true,
      ...(input.resolvedToolCallId
        ? { toolCallId: input.resolvedToolCallId }
        : {}),
    });
    for await (const chunk of stream.fullStream) {
      for (const event of converter.convert(chunk as never)) {
        emit(event);
      }
    }
  });
  for (const event of converter.finish()) {
    emit(event);
  }
  return true;
}

export async function resumeConversationRun(
  input: ResumeConversationRunInput
): Promise<{ runId: string }> {
  markRunLive(input.newRunId);
  // Durable tracking for the continuation (see startConversationRun): the
  // tracker publishes to the bus AND persists ai.agent_run(_event) so a reload
  // or second window can discover and replay this resume run.
  const tracker = input.runStore
    ? createSessionRunTracker({
        agentId: input.agentId ?? "unknown",
        createdByUserId: input.scope.userId,
        runId: input.newRunId,
        runStore: input.runStore,
        threadId: input.threadId,
        tenantId: input.scope.tenantId,
      })
    : null;
  let seq = 0;
  const emit = tracker
    ? (event: AGUIEvent) => {
        void tracker.append(event);
      }
    : (event: AGUIEvent) =>
        publishRunEvent(input.newRunId, { event, seq: seq++ });
  emit({
    runId: input.newRunId,
    threadId: input.threadId,
    type: EventType.RUN_STARTED,
  });

  const parked = input.suspendedRunId
    ? takeParkedSessionRun(input.suspendedRunId)
    : undefined;
  let reParked = false;
  let threadStatus: AgentSessionStatus = "completed";
  await patchThreadStatus({ ...input, status: "running" });
  try {
    if (!parked) {
      // Distinguish a duplicate answer racing the live resume (recoverable —
      // the in-flight resume will re-park or finish) from a lost park (server
      // restart / TTL expiry — the suspended state is genuinely gone).
      if (
        input.suspendedRunId &&
        isParkedResumeInFlight(input.suspendedRunId)
      ) {
        throw new Error(
          `A resume for run ${input.suspendedRunId} is already in progress; this duplicate answer was ignored.`
        );
      }
      // The park is gone (server restart / TTL expiry) — but Mastra also wrote
      // the suspension to workflow snapshot storage, which survives both. Try
      // to continue the run from there before giving up. Verified end-to-end
      // across two processes on 1.55.0 (see PLAN-mastra-durable-chat Phase 2).
      const resumedFromSnapshot = await resumeFromSnapshot(input, emit);
      if (resumedFromSnapshot) {
        // Close the suspended tool step in PERSISTED history. The parked lane
        // gets this from the live Session's memory write; a snapshot resume
        // leaves the original row at `state:"call"`, so on the next thread load
        // the tool renders as still spinning even though the run completed.
        await resolveToolCallResultInHistory({
          result: input.resumeData,
          scope: input.scope,
          store: input.store,
          threadId: input.threadId,
          toolCallId: input.resolvedToolCallId,
        });
        await clearOpenInterrupt(input);
        emit({
          runId: input.newRunId,
          threadId: input.threadId,
          type: EventType.RUN_FINISHED,
        });
        threadStatus = "completed";
        return { runId: input.newRunId };
      }
      throw new Error(
        `Session run ${input.suspendedRunId || "(missing)"} is no longer in memory and has no resumable snapshot; cannot resume the suspended tool (the server may have restarted).`
      );
    }
    // The tool call must actually be parked in the session. Responding to a
    // toolCallId Mastra does not know is a SILENT no-op (respondToToolSuspension
    // resolves without resuming anything) — the old code then cleared the open
    // interrupt and reported RUN_FINISHED while the run stayed suspended
    // forever. Surface it as an error and KEEP the park so the real interrupt
    // stays resumable.
    if (
      !parked.session.suspensions.has({ toolCallId: input.resolvedToolCallId })
    ) {
      parkSessionRun(input.suspendedRunId, {
        controller: parked.controller,
        mergedDefinitions: parked.mergedDefinitions,
        session: parked.session,
        threadId: parked.threadId,
      });
      reParked = true;
      throw new Error(
        `Tool call ${input.resolvedToolCallId || "(missing)"} is not suspended on run ${input.suspendedRunId}; it may already have been resumed.`
      );
    }
    const converter = new SessionAgUiConverter();
    let runError: string | null = null;
    let suspendedAgain: SuspendedAgain | null = null;
    // A second suspend in the continuation leaves respondToToolSuspension pending
    // forever — race it against this signal (same as the start executor).
    let signalSuspendAgain: () => void = () => {
      // replaced below
    };
    const suspendAgainSignal = new Promise<void>((resolve) => {
      signalSuspendAgain = resolve;
    });
    const unsub = parked.session.subscribe((event) => {
      const typed = event as {
        args?: unknown;
        error?: { message?: string };
        toolCallId?: string;
        toolName?: string;
        type?: string;
      };
      if (typed.type === "error") {
        runError = typed.error?.message ?? "Session run error";
      }
      if (typed.type === "tool_suspended") {
        suspendedAgain = {
          args: typed.args,
          suspendPayload: (typed as { suspendPayload?: unknown })
            .suspendPayload,
          toolCallId: typed.toolCallId ?? "",
          toolName: typed.toolName ?? "",
        };
        signalSuspendAgain();
      }
      for (const agui of converter.convert(event as never)) {
        emit(agui);
      }
    });

    const toolsRunContext = await buildResumeToolsRunContext(input);
    const resumeDone = engentyToolsRunAls
      .run(toolsRunContext, () =>
        parked.session.respondToToolSuspension({
          resumeData: input.resumeData,
          toolCallId: input.resolvedToolCallId,
        })
      )
      .catch((error: unknown) => {
        if (!runError) {
          runError =
            error instanceof Error ? error.message : "Session run error";
        }
      });
    await Promise.race([resumeDone, suspendAgainSignal]);
    unsub();

    // A SECOND tool suspended in the continuation (another approval gate or a
    // frontend tool) — re-emit the interrupt and re-park the SAME session for
    // the next resume.
    const again = suspendedAgain as SuspendedAgain | null;
    if (again) {
      const reRunId = parked.session.getCurrentRunId() ?? "";
      let handled = false;
      if (isToolApprovalSuspendPayload(again.suspendPayload)) {
        await emitToolApprovalInterrupt({
          busRunId: input.newRunId,
          emit,
          payload: again.suspendPayload,
          resumeRunId: reRunId,
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
          toolCallId: again.toolCallId,
        });
        handled = true;
      } else {
        handled = await emitFrontendToolInterrupt({
          busRunId: input.newRunId,
          resumeRunId: reRunId,
          emit,
          mergedDefinitions: parked.mergedDefinitions,
          payload: {
            args: again.args,
            toolCallId: again.toolCallId,
            toolName: again.toolName,
          },
          scope: input.scope,
          sessionMetadata: input.sessionMetadata ?? {},
          store: input.store,
          threadId: input.threadId,
        });
      }
      if (handled) {
        parkSessionRun(reRunId, {
          controller: parked.controller,
          mergedDefinitions: parked.mergedDefinitions,
          session: parked.session,
          threadId: input.threadId,
        });
        reParked = true;
        threadStatus = "waiting";
        return { runId: input.newRunId };
      }
    }

    for (const agui of converter.finish()) {
      emit(agui);
    }
    if (runError) {
      emit({ message: runError, type: EventType.RUN_ERROR });
      threadStatus = "failed";
      return { runId: input.newRunId };
    }
    // The interrupt is resolved — clear it from session metadata.
    await clearOpenInterrupt(input);
    emit({
      runId: input.newRunId,
      threadId: input.threadId,
      type: EventType.RUN_FINISHED,
    });
    threadStatus = "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    threadStatus = reParked ? "waiting" : "failed";
    console.error(`[conversation-resume ${input.newRunId}] failed:`, error);
    emit({ message, type: EventType.RUN_ERROR });
  } finally {
    // Only the resume that actually TOOK the parked run owns the in-flight
    // marker — a duplicate that found nothing parked must not clear the
    // marker out from under the live resume.
    if (parked && input.suspendedRunId) {
      finishParkedResume(input.suspendedRunId);
    }
    if (!reParked) {
      // An errored resume must not destroy a session that still holds parked
      // suspensions — that would strand the open interrupt forever (spinners
      // never resolve, no way to approve). Re-park so the user can retry;
      // the park TTL owns the eventual cleanup.
      if (parked?.session.suspensions.hasPending()) {
        parkSessionRun(input.suspendedRunId, {
          controller: parked.controller,
          mergedDefinitions: parked.mergedDefinitions,
          session: parked.session,
          threadId: parked.threadId,
        });
        threadStatus = "waiting";
      } else {
        await parked?.controller.destroy().catch(() => {
          // best-effort cleanup
        });
      }
    }
    await patchThreadStatus({ ...input, status: threadStatus });
    if (tracker) {
      await tracker
        .complete({
          status:
            threadStatus === "waiting"
              ? "requires_action"
              : threadStatus === "failed"
                ? "failed"
                : "completed",
        })
        .catch((error) => {
          console.error(
            `[conversation-resume ${input.newRunId}] run tracking finish failed:`,
            error
          );
        });
    }
    markRunDone(input.newRunId);
  }
  return { runId: input.newRunId };
}
