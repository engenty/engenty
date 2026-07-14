import { isAgUiOpenInterruptExpired } from "@engenty/ag-ui-bridge";
import {
  approveCopilotOpenInterrupt,
  CopilotMessageQueueSurface,
  CopilotOpenInterruptBanner,
  CopilotPanelContent,
  type CopilotPanelContentProps,
  formatCopilotRouteStatusLabel,
  pendingInterruptFromTranscript,
  type SubmitMessage,
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
  useCopilotComposerDraftRecovery,
  useCopilotMessageQueue,
  useCopilotSelectedThread,
  useCopilotThreadActions,
  useCopilotVoice,
} from "@engenty/ai-ui";
import { useAgentUiFrontendToolExecutor } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { errorMessage } from "../../lib/chat/chat-errors.js";
import { CopilotModelChooserControl } from "./copilot-model-chooser-control.js";

interface AgentChatPanelProps {
  compactContextControl?: ReactNode;
  composerPlaceholder: string;
  emptyStateSubtitle: string;
  emptyStateTitle: string;
  title: string;
}

const EMPTY_SUGGESTIONS: [] = [];
const EMPTY_CANDIDATES = {};
const HIDDEN_POSITION_MENU = <div aria-hidden className="hidden" />;

export function AgentChatPanel(props: AgentChatPanelProps) {
  const { t } = useTranslation("engenty-copilot");
  const { t: tc } = useTranslation("common");
  const {
    binding,
    host,
    isLoadingSelectedSessionMessages,
    isTransportReady,
    openInterruptFromSession,
    selectedSessionMessagesError,
    status,
    tenantId,
    userId,
  } = useCopilotSelectedThread();
  const { startNewChat } = useCopilotThreadActions();
  const executeFrontendTool = useAgentUiFrontendToolExecutor();
  const starterPrompts = useStarterPrompts();
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    Record<string, boolean>
  >({});

  const recoverySessionKey =
    binding.activeThreadId ??
    `${TEMPORARY_ENGENTY_THREAD_ID_PREFIX}${binding.newChatGeneration}`;
  const draftRecovery = useCopilotComposerDraftRecovery({
    messages: host.messages,
    threadId: recoverySessionKey,
    tenantId,
    userId,
  });

  const openInterrupt = useMemo(() => {
    if (
      !openInterruptFromSession ||
      isAgUiOpenInterruptExpired(openInterruptFromSession)
    ) {
      return null;
    }
    return openInterruptFromSession;
  }, [openInterruptFromSession]);

  const handleSandboxCommandApprove = useCallback(
    async (open: NonNullable<typeof openInterrupt>) => {
      await approveCopilotOpenInterrupt({
        activeThreadId: binding.activeThreadId,
        executeFrontendTool,
        open,
        resumeInterrupt: host.resumeInterrupt,
      });
    },
    [binding.activeThreadId, executeFrontendTool, host.resumeInterrupt]
  );

  const handleSandboxCommandReject = useCallback(
    (open: NonNullable<typeof openInterrupt>) => {
      if (open.tool_name) {
        host.resumeInterrupt?.({
          approved: false,
          interruptId: open.interrupt_id,
          toolName: open.tool_name,
        });
      }
    },
    [host.resumeInterrupt]
  );
  const controlsDisabled =
    status !== "ready" || host.awaitingInterrupt || !isTransportReady;

  const realtimeVoice = useCopilotVoice();

  const composerDisabled = controlsDisabled || realtimeVoice.session.isActive;

  const messages = useMemo(
    () => [...host.copilotMessages, ...realtimeVoice.transcriptMessages],
    [host.copilotMessages, realtimeVoice.transcriptMessages]
  );

  // The executing decision/feedback chooser to dock above the composer, read from
  // the transcript (immediate) and gated by the authoritative pending-tool-call set
  // from the stream. Fall back to the persisted open interrupt for server-driven
  // interrupts that never enter the transcript — e.g. the tool-approval gate, whose
  // suspended `engenty_tool_execute` call has no artifact result to render from.
  const dockInterrupt = useMemo(
    () =>
      host.pendingInterruptToolCallIds.size > 0
        ? (pendingInterruptFromTranscript(messages) ?? openInterrupt)
        : null,
    [host.pendingInterruptToolCallIds, messages, openInterrupt]
  );

  // "Send now" / auto-drain submit. When a run is still in flight (the user sent
  // a queued message immediately), STOP it for real first — `host.cancel()` does
  // the same thing the Stop button does (local abort + server `abortRunStream`),
  // whereas `host.submitMessage` only detaches the local stream and leaves the
  // server run burning tokens. When idle (auto-drain after a run finished) the
  // stop is a no-op and we just send.
  const stopAndSubmit = useCallback<SubmitMessage>(
    (text, options) => {
      if (status !== "ready") {
        host.cancel();
      }
      host.submitMessage(text, options);
    },
    [status, host.cancel, host.submitMessage]
  );

  // Client-side message queue: while a run is in flight, a submit from the main
  // composer is QUEUED instead of aborting the current run. Queued messages
  // auto-drain one per run as the thread returns to "ready", and are reorderable /
  // deletable / sendable-now (which STOPS the current run for real and sends).
  const queue = useCopilotMessageQueue({ status, submit: stopAndSubmit });

  // MUST forward `options` (attachments, agent override) — a text-only wrapper
  // here silently drops uploaded attachments (they upload, then never reach the
  // run input). Attachment-only sends (no text) are valid.
  const submitMessage = useCallback<SubmitMessage>(
    (text, options) => {
      const trimmed = text.trim();
      if (!(trimmed || options?.attachments?.length)) {
        return;
      }
      draftRecovery.clearDraft();
      if (status !== "ready") {
        // A run is in flight — queue this turn instead of interrupting it.
        queue.enqueue(trimmed, options);
        return;
      }
      host.submitMessage(trimmed, options);
    },
    [status, queue.enqueue, host.submitMessage, draftRecovery.clearDraft]
  );

  // Edit a queued message: remove it from the queue and load its text back into
  // the composer so the user can tweak + resend.
  const editQueuedMessage = useCallback(
    (id: string) => {
      const message = queue.queued.find((m) => m.id === id);
      if (!message) {
        return;
      }
      draftRecovery.setDraft(message.text);
      queue.remove(id);
    },
    [queue.queued, queue.remove, draftRecovery.setDraft]
  );

  // Only docked when there's actually something queued (no empty box mid-run).
  const queueSurface = queue.hasQueued ? (
    <div className="mx-auto w-full max-w-[42rem]">
      <CopilotMessageQueueSurface
        labels={{
          drag: t("chat.queue.drag"),
          edit: t("chat.queue.edit"),
          remove: t("chat.queue.remove"),
          sendNow: t("chat.queue.sendNow"),
          title: t("chat.queue.title"),
        }}
        onEdit={editQueuedMessage}
        onRemove={queue.remove}
        onReorder={queue.reorder}
        onSendNow={queue.sendNow}
        queued={queue.queued}
      />
    </div>
  ) : null;

  // Agent chooser is hidden on the main copilot lane;
  // model chooser stays visible (model selection is deferred but not retired).
  const composerLeadingControl = (
    <div className="flex min-w-0 items-center gap-1">
      <CopilotModelChooserControl disabled={composerDisabled} />
      {realtimeVoice.composerLeadingControl}
    </div>
  );

  const thinkingLabel = host.pendingSend
    ? t("chat.sending")
    : tc("copilot.thinking");

  const panelError = useMemo(() => {
    const source = host.error ?? selectedSessionMessagesError;
    if (!source) {
      return null;
    }
    return new Error(errorMessage(source));
  }, [host.error, selectedSessionMessagesError]);

  // Pending decision / feedback chooser docked directly above the composer
  // (CopilotPanelContent `dockedInterruptSurface`); the inline transcript copy
  // is suppressed via `dockedInterruptToolCallId`. The message queue docks here
  // too (above any interrupt).
  const interruptBanner = dockInterrupt ? (
    <div className="mx-auto w-full max-w-[42rem]">
      <CopilotOpenInterruptBanner
        onDecisionChoose={(artifactId, choiceId, choiceLabel, interruptId) =>
          host.respond(dockInterrupt.tool_call_id, {
            artifactId,
            choiceId,
            choiceLabel,
            interruptId,
          })
        }
        onFeedbackSubmit={(artifactId, feedback, interruptId) =>
          host.respond(dockInterrupt.tool_call_id, {
            artifactId,
            choiceId: "feedback_submit",
            choiceLabel: feedback,
            interruptId,
            payload: { feedback },
          })
        }
        onSandboxCommandApprove={handleSandboxCommandApprove}
        onSandboxCommandReject={handleSandboxCommandReject}
        open={dockInterrupt}
      />
    </div>
  ) : null;
  const dockedInterruptSurface =
    queueSurface || interruptBanner ? (
      <div className="flex flex-col gap-2">
        {queueSurface}
        {interruptBanner}
      </div>
    ) : null;

  const panelProps: CopilotPanelContentProps = {
    appliedSuggestions: EMPTY_SUGGESTIONS,
    applyError: null,
    applySelectedLabel: tc("copilot.applySelected"),
    artifactError: null,
    artifactLoadFailedLabel: tc("copilot.artifactLoadFailed"),
    attachLabel: tc("copilot.position.sidebar"),
    autoScrollKey: binding.activeThreadId ?? `new-${host.threadResetKey}`,
    bodyOnly: true,
    composerFocusKey: `${host.threadResetKey}:${binding.newChatGeneration}`,
    cancelLabel: tc("copilot.cancel"),
    clearLabel: tc("copilot.newChat"),
    closeLabel: tc("copilot.position.heading"),
    compactContextControl: props.compactContextControl,
    composerDockStyle: true,
    enableStatusFlap: false,
    composerLeadingControl,
    composerPlaceholder: props.composerPlaceholder,
    composerWrapperClassName: "mx-auto w-full max-w-[42rem]",
    contentBodyGutter: "flush",
    debugPayload: undefined,
    detachLabel: tc("copilot.position.floating"),
    draft: draftRecovery.draft,
    emptyStateSubtitle: props.emptyStateSubtitle,
    emptyStateTitle: props.emptyStateTitle,
    error: panelError,
    headerVariant: "docked",
    isApplying: false,
    latestSuggestions: EMPTY_SUGGESTIONS,
    composerOverride: realtimeVoice.composerOverride,
    messages,
    minimalChrome: true,
    onApplySuggestions: noopAsync,
    onCancel: host.cancel,
    onStop: host.cancel,
    onClose: noop,
    onNewChat: () => startNewChat(),
    onSandboxCommandApprove: handleSandboxCommandApprove,
    onSandboxCommandReject: handleSandboxCommandReject,
    onPanelModeChange: noop,
    panelMode: "docked",
    pendingUserInsertIndex: host.pendingUserInsertIndex,
    pendingUserText: host.pendingUserText,
    positionMenu: HIDDEN_POSITION_MENU,
    resumeInterrupt: (feedback) =>
      host.resumeInterrupt({
        artifactId: feedback.artifactId,
        choiceId: feedback.choiceId,
        choiceLabel: feedback.choiceLabel,
        interruptId: feedback.interruptId,
        payload: feedback.payload,
      }),
    awaitingInterrupt: host.awaitingInterrupt,
    openInterrupt,
    pendingInterruptToolCallIds: host.pendingInterruptToolCallIds,
    optimisticInterruptResults: host.optimisticInterruptResults,
    respond: host.respond,
    dockedInterruptSurface,
    dockedInterruptToolCallId: dockInterrupt?.tool_call_id ?? null,
    reviewPromptLabel: tc("copilot.reviewPrompt"),
    routeStatusLabel: formatCopilotRouteStatusLabel("engenty-copilot", "chat"),
    selectedCandidateValues: EMPTY_CANDIDATES,
    selectedCountLabel: tc("copilot.selected"),
    selectedSuggestions,
    setDraft: draftRecovery.setDraft,
    setSelectedSuggestions,
    starterPrompts,
    startMode: "manual",
    status,
    subAgentFullViewLabel: t("subAgent.fullView"),
    subAgentSectionLabels: {
      input: t("subAgent.input"),
      log: t("subAgent.log"),
      output: t("subAgent.output"),
    },
    threadId: binding.activeThreadId,
    submitMessage,
    suggestedUpdatesLabel: tc("copilot.suggestedUpdates"),
    thinkingLabel,
    title: props.title,
    transcriptContainerClassName: "mx-auto w-full max-w-[42rem] gap-4",
    transcriptLoading: isLoadingSelectedSessionMessages,
    transcriptLoadingLabel: tc("shell.loading"),
    transcriptSurface: "chat",
    triggerType: "message_copilot",
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <CopilotPanelContent {...panelProps} />
    </div>
  );
}

function useStarterPrompts() {
  const { t } = useTranslation("engenty-copilot");
  return useMemo(
    () => [
      {
        id: "hello-one-line",
        label: t("chat.starters.helloOneLine.label"),
        prompt: t("chat.starters.helloOneLine.prompt"),
      },
      {
        id: "protocol-test",
        label: t("chat.starters.protocolTest.label"),
        prompt: t("chat.starters.protocolTest.prompt"),
      },
      {
        id: "what-is-this",
        label: t("chat.starters.whatIsThis.label"),
        prompt: t("chat.starters.whatIsThis.prompt"),
      },
    ],
    [t]
  );
}

function noop() {}

async function noopAsync() {}
