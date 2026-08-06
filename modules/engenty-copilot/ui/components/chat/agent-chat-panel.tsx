import { isAgUiOpenInterruptExpired } from "@engenty/ag-ui-bridge";
import {
  approveCopilotOpenInterrupt,
  CopilotDrawerPositionMenu,
  CopilotMessageQueueSurface,
  CopilotOpenInterruptBanner,
  type CopilotOpenInterruptResumeInterrupt,
  CopilotPanelContent,
  type CopilotPanelContentProps,
  ENGENTY_COPILOT_HOST_KEY,
  formatCopilotRouteStatusLabel,
  formatCopilotThreadCopyText,
  pendingInterruptFromTranscript,
  registerCopilotComposerDraftSetter,
  type SubmitMessage,
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
  useCopilotComposerDraftRecovery,
  useCopilotMessageQueue,
  useCopilotSelectedThread,
  useCopilotThreadActions,
  useCopilotVoice,
  useMentionAgentCandidates,
} from "@engenty/ai-ui";
import { useAgentUiFrontendToolExecutor } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useChatSlashCommands } from "../../hooks/chat/use-chat-slash-commands.js";
import { useMentionRefSearch } from "../../hooks/chat/use-mention-ref-search.js";
import { errorMessage } from "../../lib/chat/chat-errors.js";
import { CopilotEffortControl } from "./copilot-effort-control.js";

interface AgentChatPanelProps {
  compactContextControl?: ReactNode;
  composerPlaceholder: string;
  emptyStateSubtitle: string;
  emptyStateTitle: string;
  title: string;
}

const EMPTY_SUGGESTIONS: [] = [];
const EMPTY_CANDIDATES = {};

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

  // Slash commands: core built-ins + module contributions + server catalog.
  const slashBuiltins = useMemo(
    () => [
      {
        command: "help",
        description: t("chat.commands.help", {
          defaultValue: "Browse all commands",
        }),
        group: "Core",
        kind: "ui" as const,
      },
      {
        command: "clear",
        description: t("chat.commands.clear", {
          defaultValue: "Start a new conversation",
        }),
        group: "Core",
        kind: "ui" as const,
        run: () => startNewChat(),
      },
    ],
    [startNewChat, t]
  );
  const runFrontendTool = useCallback(
    (toolName: string, argsText: string) => {
      void executeFrontendTool({
        call_id: `slash-${Date.now()}`,
        input: { argsText },
        run_id: "slash-command",
        tool_name: toolName,
      });
    },
    [executeFrontendTool]
  );
  const slashCommands = useChatSlashCommands({
    builtins: slashBuiltins,
    runFrontendTool,
  });
  const mentionAgentCandidates = useMentionAgentCandidates();
  const mentionRefSearch = useMentionRefSearch();
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

  // Panel affordances ("Ask the agent to…") prefill this composer through the
  // host-keyed draft bridge — see ObjectDisplayIntent.askAgent.
  useEffect(
    () =>
      registerCopilotComposerDraftSetter(
        ENGENTY_COPILOT_HOST_KEY,
        draftRecovery.setDraft
      ),
    [draftRecovery.setDraft]
  );

  const openInterrupt = useMemo(() => {
    if (
      !openInterruptFromSession ||
      isAgUiOpenInterruptExpired(openInterruptFromSession)
    ) {
      return null;
    }
    return openInterruptFromSession;
  }, [openInterruptFromSession]);

  const resumeOpenInterrupt = useCallback<CopilotOpenInterruptResumeInterrupt>(
    (feedback) => {
      host.resumeInterrupt?.(
        feedback as unknown as Parameters<
          NonNullable<typeof host.resumeInterrupt>
        >[0]
      );
    },
    [host.resumeInterrupt]
  );

  const handleSandboxCommandApprove = useCallback(
    async (open: NonNullable<typeof openInterrupt>) => {
      await approveCopilotOpenInterrupt({
        activeThreadId: binding.activeThreadId,
        executeFrontendTool,
        open,
        resumeInterrupt: resumeOpenInterrupt,
      });
    },
    [binding.activeThreadId, executeFrontendTool, resumeOpenInterrupt]
  );

  const handleSandboxCommandReject = useCallback(
    (open: NonNullable<typeof openInterrupt>) => {
      if (open.tool_name) {
        resumeOpenInterrupt({
          approved: false,
          interruptId: open.interrupt_id,
          toolName: open.tool_name,
        });
      }
    },
    [resumeOpenInterrupt]
  );
  const controlsDisabled =
    status !== "ready" || host.awaitingInterrupt || !isTransportReady;

  const realtimeVoice = useCopilotVoice();

  const composerDisabled = controlsDisabled || realtimeVoice.session.isActive;

  const messages = useMemo(
    () => [...host.copilotMessages, ...realtimeVoice.transcriptMessages],
    [host.copilotMessages, realtimeVoice.transcriptMessages]
  );
  const threadCopyText = useMemo(
    () => formatCopilotThreadCopyText(messages),
    [messages]
  );
  const handleCopyThread = useCallback(async () => {
    if (!threadCopyText) {
      return;
    }
    await navigator.clipboard.writeText(threadCopyText);
  }, [threadCopyText]);
  const positionMenu = (
    <CopilotDrawerPositionMenu
      canCopyThread={threadCopyText.length > 0}
      copyThreadCopiedLabel={tc("copilot.copyThreadCopied")}
      copyThreadLabel={tc("copilot.copyThread")}
      onCopyThread={handleCopyThread}
      positionMenuAriaLabel={tc("copilot.position.menu")}
      showPositionOptions={false}
    />
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
  const queue = useCopilotMessageQueue({
    status,
    submit: stopAndSubmit,
    // Scope the queue to the active thread so it resets on a thread switch /
    // "New chat" and can never replay into an unrelated thread.
    threadId: recoverySessionKey,
    // An open approval interrupt pauses the run for the user — don't auto-drain
    // the next turn across a pending approval.
    blocked: host.awaitingInterrupt,
  });

  // Stop clears the queue too: stopping a wedged/parked run must not leave
  // messages parked to auto-send once the thread frees up.
  const stopAndClearQueue = useCallback(() => {
    queue.clear();
    host.cancel();
  }, [queue.clear, host.cancel]);

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
  // No width wrapper: docked surfaces render inside the composer dock flap,
  // which already sits in the composer's width-constrained wrapper.
  const queueSurface = queue.hasQueued ? (
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
  ) : null;

  // Agent chooser is hidden on the main copilot lane; the effort selector is
  // the model control people see (the model-id chooser sits behind its expert
  // switch).
  const composerLeadingControl = (
    <div className="flex min-w-0 items-center gap-1">
      <CopilotEffortControl disabled={composerDisabled} />
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
    mentionAgentCandidates,
    mentionRefSearch,
    slashCommands,
    headerVariant: "docked",
    isApplying: false,
    latestSuggestions: EMPTY_SUGGESTIONS,
    composerOverride: realtimeVoice.composerOverride,
    messages,
    minimalChrome: true,
    onApplySuggestions: noopAsync,
    onCancel: stopAndClearQueue,
    onStop: stopAndClearQueue,
    onClose: noop,
    onNewChat: () => startNewChat(),
    onSandboxCommandApprove: handleSandboxCommandApprove,
    onSandboxCommandReject: handleSandboxCommandReject,
    onPanelModeChange: noop,
    panelMode: "docked",
    pendingUserInsertIndex: host.pendingUserInsertIndex,
    pendingUserText: host.pendingUserText,
    positionMenu,
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
