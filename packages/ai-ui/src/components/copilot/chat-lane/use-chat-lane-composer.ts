"use client";

import {
  type AgUiOpenInterruptMetadata,
  isAgUiOpenInterruptExpired,
} from "@engenty/ag-ui-bridge";
import { useAgentUiFrontendToolExecutor } from "@engenty/app-shell";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useMemo, useRef } from "react";
import { isInterruptResolvedLocally } from "../../../ag-ui/apps-ai/use-engenty-ag-ui-apps-ai-session.js";
import type {
  AgentHost,
  SubmitMessage,
  SubmitMessageOptions,
} from "../../../agent-provider/types.js";
import { approveCopilotOpenInterrupt } from "../../../copilot/approve-copilot-open-interrupt.js";
import { useCopilotComposerDraftRecovery } from "../../../copilot/use-copilot-composer-draft-recovery.js";
import {
  type CopilotMessageQueue,
  type CopilotRunStatus,
  useCopilotMessageQueue,
} from "../../../copilot/use-copilot-message-queue.js";
import { hasRenderableOpenInterrupt } from "../interrupts/copilot-open-interrupt-banner.js";
import { pendingInterruptFromTranscript } from "../interrupts/pending-interrupt-from-transcript.js";
import type { CopilotPanelContentProps } from "../panel/copilot-panel-content-types.js";

/**
 * A graph-run step docked above the composer. While one is docked the
 * composer answers IT: free text resumes the gate as an utterance when the
 * step accepts text, and is otherwise refused — never a new agent turn and
 * never a steer, because graph runs are not in that register.
 */
export interface ChatLaneDockedGate {
  acceptsText: boolean;
  submitUtterance: (text: string) => void;
}

export interface UseChatLaneComposerParams {
  /** The step a parked graph run is waiting on, when one is docked. */
  dockedGate?: ChatLaneDockedGate | null;
  /** Host-bound host for this lane (copilot host, or a desk's per-agent host). */
  host: AgentHost;
  /**
   * The transcript as rendered — copilot messages plus anything the lane splices
   * in (e.g. live voice turns). Read to find the executing decision chooser.
   */
  messages: CopilotPanelContentProps["messages"];
  /** Interrupt persisted on the session, for gates that never enter the stream. */
  /** After a sandbox command is approved — the surface it came from refreshes. */
  onSandboxApproved?: () => void;
  openInterruptFromSession: AgUiOpenInterruptMetadata | null;
  /** Run status with `pendingSend` already folded in. */
  status: CopilotRunStatus;
  tenantId: string;
  /**
   * Scope key for the draft + queue. MUST change on thread switch and on "New
   * chat", so neither can replay into an unrelated thread.
   */
  threadKey: string;
  userId: string;
}

export interface ChatLaneComposer {
  /** Decision / approval chooser to dock, or null when nothing is parked. */
  dockInterrupt: AgUiOpenInterruptMetadata | null;
  draft: string;
  /** Pull a queued message back into the composer for editing. */
  editQueuedMessage: (id: string) => void;
  onSandboxCommandApprove: (open: AgUiOpenInterruptMetadata) => Promise<void>;
  onSandboxCommandReject: (open: AgUiOpenInterruptMetadata) => void;
  /** Live interrupt if any, else the session's — expired ones filtered out. */
  openInterrupt: AgUiOpenInterruptMetadata | null;
  queue: CopilotMessageQueue;
  setDraft: Dispatch<SetStateAction<string>>;
  /** Stop button: abort the run for real AND drop anything parked to send. */
  stopAndClearQueue: () => void;
  submitMessage: SubmitMessage;
}

/**
 * Everything a chat lane's composer needs that is not the agent behind it.
 *
 * Draft recovery, the queue-while-running behaviour, interrupt resolution and
 * the sandbox approve/reject handlers are identical whether the lane is talking
 * to the copilot or to a specialist — they are properties of the composer, not
 * of the agent. Two copies of this drifted apart once already (the desk had no
 * queue at all); one hook is the point.
 */
export function useChatLaneComposer(
  params: UseChatLaneComposerParams
): ChatLaneComposer {
  const { dockedGate, host, messages, status, threadKey } = params;
  const executeFrontendTool = useAgentUiFrontendToolExecutor();

  const draftRecovery = useCopilotComposerDraftRecovery({
    messages: host.messages,
    tenantId: params.tenantId,
    threadId: threadKey,
    userId: params.userId,
  });

  // The LIVE stream value wins while set. `requestDecision` suspends the run
  // natively, so its chooser exists ONLY in the open interrupt — the tool call
  // has no output for the transcript path to read. Without the stream arm a
  // lane waits for the session-metadata refetch and, until then, shows a
  // generic spinning "Decision needed" row with no way to answer it.
  // Both arms skip an interrupt this client already answered or dismissed:
  // the session copy lags its refetch and would re-show the closed card.
  const openInterrupt = useMemo(() => {
    const resolved = host.resolvedInterruptToolCallIds;
    const fromStream = host.openInterruptFromStream;
    if (
      fromStream &&
      !isAgUiOpenInterruptExpired(fromStream) &&
      !isInterruptResolvedLocally(fromStream, resolved)
    ) {
      return fromStream;
    }
    const fromSession = params.openInterruptFromSession;
    if (
      !fromSession ||
      isAgUiOpenInterruptExpired(fromSession) ||
      isInterruptResolvedLocally(fromSession, resolved)
    ) {
      return null;
    }
    return fromSession;
  }, [
    host.openInterruptFromStream,
    host.resolvedInterruptToolCallIds,
    params.openInterruptFromSession,
  ]);

  // Auto-drain submit, and the fallback when a message could not be steered.
  // When a run is still in flight, STOP it for real first — `host.cancel()`
  // does what the Stop button does (local abort + server `abortRunStream`),
  // whereas `host.submitMessage` only detaches the local stream and leaves the
  // server run burning tokens. When idle (auto-drain after a run finished) the
  // stop is a no-op and we just send. Status is read live: a steer that came
  // back unaccepted may land after the run already ended.
  const statusRef = useRef(status);
  statusRef.current = status;
  const stopAndSubmit = useCallback<SubmitMessage>(
    (text, options) => {
      // A run this window merely attached to is someone else's turn: leave it
      // running and send — the server steers or, if it just ended, starts.
      if (statusRef.current !== "ready" && !host.attachedRunId) {
        host.cancel();
      }
      host.submitMessage(text, options);
    },
    [host.attachedRunId, host.cancel, host.submitMessage]
  );

  // "Send now" on a queued message: into the running loop, like Enter. Only
  // when the loop will not take it does it stop the run and send.
  const steerOrStopAndSubmit = useCallback<SubmitMessage>(
    (text, options) => {
      if (
        statusRef.current === "ready" ||
        !host.steer ||
        joinsAnotherAgent(options)
      ) {
        stopAndSubmit(text, options);
        return;
      }
      void host.steer(text, options).then((steered) => {
        if (!steered) {
          stopAndSubmit(text, options);
        }
      });
    },
    [host.steer, stopAndSubmit]
  );

  const queue = useCopilotMessageQueue({
    // An open approval interrupt pauses the run for the user — don't auto-drain
    // the next turn across a pending approval.
    blocked: host.awaitingInterrupt,
    sendNow: steerOrStopAndSubmit,
    status,
    submit: stopAndSubmit,
    threadId: threadKey,
  });

  // MUST forward `options` (attachments, agent override) — a text-only wrapper
  // here silently drops uploaded attachments. Attachment-only sends are valid.
  const submitMessage = useCallback<SubmitMessage>(
    (text, options) => {
      const trimmed = text.trim();
      if (!(trimmed || options?.attachments?.length)) {
        return;
      }
      if (dockedGate) {
        // The words answer the docked step, or nothing: a step that takes no
        // text has already replaced the composer with a hint.
        if (dockedGate.acceptsText && trimmed) {
          draftRecovery.clearDraft();
          dockedGate.submitUtterance(trimmed);
        }
        return;
      }
      draftRecovery.clearDraft();
      const { queue: waitForRun, ...sendOptions } = options ?? {};
      if (status !== "ready") {
        // Enter: the message goes INTO the running loop — this window's own
        // turn or one it attached to — and the agent reads it at its next
        // step. If the loop ended before it landed, it queues as before.
        // Mod+Enter (or a turn for another agent): wait for the run to finish.
        if (!waitForRun && host.steer && !joinsAnotherAgent(sendOptions)) {
          void host.steer(trimmed, sendOptions).then((steered) => {
            if (!steered) {
              queue.enqueue(trimmed, sendOptions);
            }
          });
          return;
        }
        queue.enqueue(trimmed, sendOptions);
        return;
      }
      host.submitMessage(trimmed, sendOptions);
    },
    [
      dockedGate,
      draftRecovery.clearDraft,
      host.steer,
      host.submitMessage,
      queue.enqueue,
      status,
    ]
  );

  // Stop clears the queue too: stopping a wedged run must not leave messages
  // parked to auto-send once the thread frees up.
  const stopAndClearQueue = useCallback(() => {
    queue.clear();
    host.cancel();
  }, [host.cancel, queue.clear]);

  const editQueuedMessage = useCallback(
    (id: string) => {
      const message = queue.queued.find((item) => item.id === id);
      if (!message) {
        return;
      }
      draftRecovery.setDraft(message.text);
      queue.remove(id);
    },
    [draftRecovery.setDraft, queue.queued, queue.remove]
  );

  const onSandboxCommandApprove = useCallback(
    async (open: AgUiOpenInterruptMetadata) => {
      await approveCopilotOpenInterrupt({
        activeThreadId: host.threadId,
        executeFrontendTool,
        onSuccess: params.onSandboxApproved,
        open,
        resumeInterrupt: (feedback) => host.resumeInterrupt(feedback),
      });
    },
    [
      executeFrontendTool,
      host.resumeInterrupt,
      host.threadId,
      params.onSandboxApproved,
    ]
  );

  const onSandboxCommandReject = useCallback(
    (open: AgUiOpenInterruptMetadata) => {
      if (open.tool_name) {
        host.resumeInterrupt({
          approved: false,
          interruptId: open.interrupt_id,
          toolName: open.tool_name,
        });
      }
    },
    [host.resumeInterrupt]
  );

  // Read from the transcript (immediate) and gated by the authoritative
  // pending-tool-call set from the stream. Fall back to the persisted open
  // interrupt for server-driven gates that never enter the transcript — e.g.
  // the tool-approval gate, whose suspended `engenty_tool_execute` call has no
  // artifact result to render from. An interrupt the dock has no card for
  // (a frontend-tool suspend) stays null — any dock element opens the flap.
  const dockInterrupt = useMemo(() => {
    if (host.pendingInterruptToolCallIds.size === 0) {
      return null;
    }
    const open = pendingInterruptFromTranscript(messages) ?? openInterrupt;
    return open && hasRenderableOpenInterrupt(open) ? open : null;
  }, [host.pendingInterruptToolCallIds, messages, openInterrupt]);

  return {
    dockInterrupt,
    draft: draftRecovery.draft,
    editQueuedMessage,
    onSandboxCommandApprove,
    onSandboxCommandReject,
    openInterrupt,
    queue,
    setDraft: draftRecovery.setDraft,
    stopAndClearQueue,
    submitMessage,
  };
}

/** A turn for another agent (an @-mention) cannot join this agent's loop. */
function joinsAnotherAgent(options?: SubmitMessageOptions): boolean {
  return Boolean(options?.requestedAgentId);
}
