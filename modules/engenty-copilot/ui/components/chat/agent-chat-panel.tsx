import {
  ChatLaneDock,
  CopilotDrawerPositionMenu,
  CopilotPanelContent,
  type CopilotPanelContentProps,
  chatLanePanelBaseProps,
  ENGENTY_COPILOT_HOST_KEY,
  formatCopilotRouteStatusLabel,
  formatCopilotThreadCopyText,
  registerCopilotComposerDraftSetter,
  TEMPORARY_ENGENTY_THREAD_ID_PREFIX,
  TranscriptLoadOlder,
  useChatLaneComposer,
  useChatSlashCommands,
  useCopilotSelectedThread,
  useCopilotThreadActions,
  useCopilotVoice,
  useMentionAgentCandidates,
} from "@engenty/ai-ui";
import { useAgentUiFrontendToolExecutor } from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { Eye } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMentionRefSearch } from "../../hooks/chat/use-mention-ref-search.js";
import { errorMessage } from "../../lib/chat/chat-errors.js";
import { CopilotEffortControl } from "./copilot-effort-control.js";
import { CopilotHostMessageHandoff } from "./copilot-host-message-handoff.js";

interface AgentChatPanelProps {
  compactContextControl?: ReactNode;
  composerPlaceholder: string;
  emptyStateSubtitle: string;
  emptyStateTitle: string;
  title: string;
}

const EMPTY_SUGGESTIONS: [] = [];
const EMPTY_CANDIDATES = {};

/**
 * The copilot's full-page chat lane.
 *
 * The composer wiring and the lane's measure come from the shared chat-lane base
 * (`useChatLaneComposer` / `chatLanePanelBaseProps`), the same one a specialist
 * desk draws from. What is added here is what only the copilot has: slash
 * commands, @-mentions, realtime voice, the effort chooser, and the position
 * menu — the copilot is the one agent that can also live in a drawer, a sidebar
 * or a floating window.
 */
export function AgentChatPanel(props: AgentChatPanelProps) {
  const { t } = useTranslation("engenty-copilot");
  const { t: tc } = useTranslation("common");
  const {
    binding,
    host,
    isLoadingSelectedSessionMessages,
    isReadOnlyThread,
    isTransportReady,
    openInterruptFromSession,
    selectedSessionMessagesError,
    status,
    tenantId,
    thread,
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

  const realtimeVoice = useCopilotVoice();

  // Live voice turns are spliced into the transcript the panel renders, so the
  // lane must read the same list when it looks for a parked chooser.
  const messages = useMemo(
    () => [...host.copilotMessages, ...realtimeVoice.transcriptMessages],
    [host.copilotMessages, realtimeVoice.transcriptMessages]
  );

  const recoverySessionKey =
    binding.activeThreadId ??
    `${TEMPORARY_ENGENTY_THREAD_ID_PREFIX}${binding.newChatGeneration}`;
  const lane = useChatLaneComposer({
    host,
    messages,
    openInterruptFromSession,
    status,
    tenantId,
    threadKey: recoverySessionKey,
    userId,
  });

  // Panel affordances ("Ask the agent to…") prefill this composer through the
  // host-keyed draft bridge — see ObjectDisplayIntent.askAgent.
  useEffect(
    () =>
      registerCopilotComposerDraftSetter(
        ENGENTY_COPILOT_HOST_KEY,
        lane.setDraft
      ),
    [lane.setDraft]
  );

  const controlsDisabled =
    status !== "ready" || host.awaitingInterrupt || !isTransportReady;
  const composerDisabled = controlsDisabled || realtimeVoice.session.isActive;

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

  // Queued messages and the pending decision / approval chooser dock directly
  // above the composer; the inline transcript copy of the chooser is suppressed
  // via `dockedInterruptToolCallId`. Only rendered when something is actually
  // pending — any non-null dock is a visible flap.
  const dockedInterruptSurface =
    lane.queue.hasQueued || lane.dockInterrupt ? (
      <ChatLaneDock
        dockInterrupt={lane.dockInterrupt}
        host={host}
        labels={{
          drag: t("chat.queue.drag"),
          edit: t("chat.queue.edit"),
          remove: t("chat.queue.remove"),
          sendNow: t("chat.queue.sendNow"),
          title: t("chat.queue.title"),
        }}
        onEditQueued={lane.editQueuedMessage}
        onSandboxCommandApprove={lane.onSandboxCommandApprove}
        onSandboxCommandReject={lane.onSandboxCommandReject}
        queue={lane.queue}
      />
    ) : null;

  const panelProps: CopilotPanelContentProps = {
    ...chatLanePanelBaseProps(tc),
    appliedSuggestions: EMPTY_SUGGESTIONS,
    autoScrollKey: binding.activeThreadId ?? `new-${host.threadResetKey}`,
    awaitingInterrupt: host.awaitingInterrupt,
    clearLabel: tc("copilot.newChat"),
    compactContextControl: props.compactContextControl,
    composerFocusKey: `${host.threadResetKey}:${binding.newChatGeneration}`,
    composerLeadingControl,
    // An agent's task thread can be opened from the task page. Space members
    // and task readers may write; Copilot stays owner-only. Say so instead of
    // offering an input whose every send the server rejects.
    composerOverride: isReadOnlyThread ? (
      <ReadOnlyThreadNotice label={t("chat.readOnlyThread")} />
    ) : (
      realtimeVoice.composerOverride
    ),
    composerPlaceholder: props.composerPlaceholder,
    debugPayload: undefined,
    dockedInterruptSurface,
    dockedInterruptToolCallId: lane.dockInterrupt?.tool_call_id ?? null,
    draft: lane.draft,
    emptyStateSubtitle: props.emptyStateSubtitle,
    emptyStateTitle: props.emptyStateTitle,
    error: panelError,
    headerVariant: "docked",
    mentionAgentCandidates,
    mentionRefSearch,
    messages,
    onCancel: lane.stopAndClearQueue,
    onNewChat: () => startNewChat(),
    onSandboxCommandApprove: lane.onSandboxCommandApprove,
    onSandboxCommandReject: lane.onSandboxCommandReject,
    onStop: lane.stopAndClearQueue,
    openInterrupt: lane.openInterrupt,
    optimisticInterruptResults: host.optimisticInterruptResults,
    pendingInterruptToolCallIds: host.pendingInterruptToolCallIds,
    pendingUserInsertIndex: host.pendingUserInsertIndex,
    pendingUserParts: host.pendingUserParts,
    pendingUserText: host.pendingUserText,
    positionMenu,
    respond: host.respond,
    resumeInterrupt: (feedback) =>
      host.resumeInterrupt({
        artifactId: feedback.artifactId,
        choiceId: feedback.choiceId,
        choiceLabel: feedback.choiceLabel,
        interruptId: feedback.interruptId,
        payload: feedback.payload,
      }),
    routeStatusLabel: formatCopilotRouteStatusLabel("engenty-copilot", "chat"),
    selectedCandidateValues: EMPTY_CANDIDATES,
    selectedSuggestions,
    setDraft: lane.setDraft,
    setSelectedSuggestions,
    slashCommands,
    starterPrompts,
    status,
    // Reasoning/tool deltas don't change `messages` — feed raw stream activity
    // so the no-response guard never errors a live run.
    streamActivityCount: host.events.length,
    subAgentFullViewLabel: t("subAgent.fullView"),
    subAgentSectionLabels: {
      input: t("subAgent.input"),
      log: t("subAgent.log"),
      output: t("subAgent.output"),
    },
    submitMessage: lane.submitMessage,
    thinkingLabel,
    threadId: binding.activeThreadId,
    title: props.title,
    transcriptHeader: (
      <TranscriptLoadOlder olderMessages={thread.olderMessages} />
    ),
    transcriptLoading: isLoadingSelectedSessionMessages,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <CopilotHostMessageHandoff />
      <CopilotPanelContent {...panelProps} />
    </div>
  );
}

function ReadOnlyThreadNotice({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-muted-foreground text-sm">
      <Eye aria-hidden="true" className="size-4 shrink-0" />
      <span>{label}</span>
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
