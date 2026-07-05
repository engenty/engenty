// Resume a run that suspended on a tool (Phase 3.2) — a browser-executed
// frontend tool or the execute tool's approval gate. Reattaches to the PARKED
// session (kept alive in-process by startConversationRun) and calls
// `session.respondToToolSuspension({ resumeData, toolCallId })` — which drives
// `agent.resumeStream` internally and streams the continuation through the
// session's subscribe listener. If the session is no longer parked (server
// restart since the suspend), surfaces a clear RUN_ERROR — the suspended state
// is in-memory.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import type { FrontendToolResumeData } from "../../../ai/frontend-tools/native-frontend-tool.js";
import {
  isToolApprovalSuspendPayload,
  type ToolApprovalResumeData,
} from "../../../ai/tools/engenty-tools/index.js";
import {
  engentyToolsRunAls,
  getEngentyToolsRunContext,
} from "../../../ai/tools/engenty-tools/lib/run-context.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import {
  loadConnectionApprovalGrants,
  mergeApprovalGrants,
} from "../sessions/connection-approval-grants.js";
import { mergeAgUiOpenInterruptMetadata } from "../sessions/interrupts.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import { readToolApprovalGrants } from "../sessions/tool-approval-grants.js";
import type { AiSessionScope } from "../sessions/types.js";
import {
  emitFrontendToolInterrupt,
  emitToolApprovalInterrupt,
} from "./emit-interrupt.js";
import { SessionAgUiConverter } from "./session-agui-bridge.js";
import { parkSessionRun, takeParkedSessionRun } from "./session-park.js";

/** A second tool that suspended within the resumed continuation. */
interface SuspendedAgain {
  args: unknown;
  suspendPayload: unknown;
  toolCallId: string;
  toolName: string;
}

export interface ResumeConversationRunInput {
  // The new run id the client attached to for this resume POST.
  newRunId: string;
  // The just-resolved interrupt's toolCallId (the suspended tool).
  resolvedToolCallId: string;
  // The browser's frontend-tool result, or the user's approval decision.
  resumeData: FrontendToolResumeData | ToolApprovalResumeData;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: AgentSessionStore;
  // The suspended session run id (from the open interrupt's `run_id`).
  suspendedRunId: string;
  threadId: string;
}

export async function resumeConversationRun(
  input: ResumeConversationRunInput
): Promise<{ runId: string }> {
  markRunLive(input.newRunId);
  let seq = 0;
  const emit = (event: AGUIEvent) =>
    publishRunEvent(input.newRunId, { event, seq: seq++ });
  emit({
    runId: input.newRunId,
    threadId: input.threadId,
    type: "RUN_STARTED",
  });

  const parked = input.suspendedRunId
    ? takeParkedSessionRun(input.suspendedRunId)
    : undefined;
  let reParked = false;
  try {
    if (!parked) {
      throw new Error(
        `Session run ${input.suspendedRunId || "(missing)"} is no longer in memory; cannot resume the suspended tool (the server may have restarted).`
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

    // Drive the continuation inside the engenty-tools run context, mirroring the
    // start executor: without it, a SECOND gated tool call in the continuation
    // (e.g. the model retrying after an error) would see no approvalPolicy and be
    // denied instead of suspending again. Grants persisted for this chat (incl. a
    // just-granted "approve once"/"always") are threaded through so re-approved
    // operations skip the gate.
    const toolsRunContext = {
      ...getEngentyToolsRunContext(),
      approvalGrants: mergeApprovalGrants(
        readToolApprovalGrants(input.sessionMetadata ?? {}),
        await loadConnectionApprovalGrants({
          userAccessToken: input.scope.userAccessToken,
        })
      ),
      approvalPolicy: "suspend" as const,
      runId: input.newRunId,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      ...(input.scope.userAccessToken
        ? { userAccessToken: input.scope.userAccessToken }
        : {}),
    };
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
        return { runId: input.newRunId };
      }
    }

    for (const agui of converter.finish()) {
      emit(agui);
    }
    if (runError) {
      emit({ message: runError, type: "RUN_ERROR" });
      return { runId: input.newRunId };
    }
    // The interrupt is resolved — clear it from session metadata.
    try {
      await input.store.updateSessionForUser({
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
    emit({
      runId: input.newRunId,
      threadId: input.threadId,
      type: "RUN_FINISHED",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[conversation-resume ${input.newRunId}] failed:`, error);
    emit({ message, type: "RUN_ERROR" });
  } finally {
    markRunDone(input.newRunId);
    if (!reParked) {
      await parked?.controller.destroy().catch(() => {
        // best-effort cleanup
      });
    }
  }
  return { runId: input.newRunId };
}
