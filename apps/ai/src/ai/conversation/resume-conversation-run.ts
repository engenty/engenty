// Resume a harness_session run that suspended on a frontend tool (Phase 3.2).
// Reattaches to the PARKED Harness (kept alive in-process by startConversationRun)
// and calls `harness.respondToToolSuspension({ resumeData, toolCallId })` — which
// drives `agent.resumeStream` internally and streams the continuation through the
// Harness's subscribe listener. If the Harness is no longer parked (server restart
// since the suspend), surfaces a clear RUN_ERROR — the suspended state is in-memory.
import type { AGUIEvent } from "@engenty/ag-ui-bridge";
import type { FrontendToolResumeData } from "../../../ai/frontend-tools/native-frontend-tool.js";
import type { AgentSessionStore } from "../../dal/agent-sessions/index.js";
import { mergeAgUiOpenInterruptMetadata } from "../sessions/interrupts.js";
import {
  markRunDone,
  markRunLive,
  publishRunEvent,
} from "../sessions/run-event-bus.js";
import type { AiSessionScope } from "../sessions/types.js";
import { emitFrontendToolInterrupt } from "./emit-interrupt.js";
import { HarnessAgUiConverter } from "./harness-agui-bridge.js";
import { parkHarnessRun, takeParkedHarnessRun } from "./harness-park.js";

/** A second frontend tool that suspended within the resumed continuation. */
interface SuspendedAgain {
  args: unknown;
  toolCallId: string;
  toolName: string;
}

export interface ResumeConversationRunInput {
  // The new run id the client attached to for this resume POST.
  newRunId: string;
  // The just-resolved interrupt's toolCallId (the suspended frontend tool).
  resolvedToolCallId: string;
  // The browser's frontend-tool result.
  resumeData: FrontendToolResumeData;
  scope: AiSessionScope;
  sessionMetadata?: Record<string, unknown>;
  store: AgentSessionStore;
  // The suspended Harness run id (from the open interrupt's `run_id`).
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
    ? takeParkedHarnessRun(input.suspendedRunId)
    : undefined;
  let reParked = false;
  try {
    if (!parked) {
      throw new Error(
        `Harness run ${input.suspendedRunId || "(missing)"} is no longer in memory; cannot resume the frontend-tool interrupt (the server may have restarted).`
      );
    }
    const converter = new HarnessAgUiConverter();
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
    const unsub = parked.harness.subscribe((event) => {
      const typed = event as {
        args?: unknown;
        error?: { message?: string };
        toolCallId?: string;
        toolName?: string;
        type?: string;
      };
      if (typed.type === "error") {
        runError = typed.error?.message ?? "Harness run error";
      }
      if (typed.type === "tool_suspended") {
        suspendedAgain = {
          args: typed.args,
          toolCallId: typed.toolCallId ?? "",
          toolName: typed.toolName ?? "",
        };
        signalSuspendAgain();
      }
      for (const agui of converter.convert(event as never)) {
        emit(agui);
      }
    });

    const resumeDone = parked.harness
      .respondToToolSuspension({
        resumeData: input.resumeData,
        toolCallId: input.resolvedToolCallId,
      })
      .catch((error: unknown) => {
        if (!runError) {
          runError =
            error instanceof Error ? error.message : "Harness run error";
        }
      });
    await Promise.race([resumeDone, suspendAgainSignal]);
    unsub();

    // A SECOND frontend tool suspended in the continuation — re-emit the interrupt
    // and re-park the SAME Harness for the next resume.
    const again = suspendedAgain as SuspendedAgain | null;
    if (again) {
      const reRunId = parked.harness.session.getCurrentRunId() ?? "";
      const handled = await emitFrontendToolInterrupt({
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
      if (handled) {
        parkHarnessRun(
          reRunId,
          parked.harness,
          input.threadId,
          parked.mergedDefinitions
        );
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
      await parked?.harness.destroy().catch(() => {
        // best-effort cleanup
      });
    }
  }
  return { runId: input.newRunId };
}
