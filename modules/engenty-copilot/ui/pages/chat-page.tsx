// Full-page chat is a dumb view over copilot host + binding hooks.
// The app-root provider owns threadId, transcript, navigation, and session
// list state; this page registers shell chrome and renders panels.

import {
  SubAgentRunFullPage,
  selectSubAgentDelegationFromMessages,
  useCopilotSelectedThread,
  useCopilotThreadActions,
} from "@engenty/ai-ui";
import { useTranslation } from "@engenty/i18n/ui";
import { type PageBreadcrumb, usePageConfig } from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatPanel } from "../components/chat/chat-panel.js";
import { ChatTopbarActions } from "../components/chat/new-chat-action.js";
import { ChatShellHeader } from "../components/chat/shell-header.js";
import { CopilotModuleErrorBoundary } from "../components/copilot-module-error-boundary.js";
import { SessionList } from "../components/session-list/session-list.js";
import { logCopilotChatPanel } from "../dev/chat-panel-debug.js";
import {
  copilotChatThreadPath,
  readCopilotSubRunToolCallId,
} from "../paths.js";

export function CopilotChatPage() {
  const { t } = useTranslation("engenty-copilot");
  const { t: tc } = useTranslation("common");
  const {
    binding,
    host,
    isLoadingSelectedSessionMessages,
    isSelectedSessionNotFound,
    selectedSessionMessagesError,
    status,
    thread,
  } = useCopilotSelectedThread();
  const { startNewChat } = useCopilotThreadActions();
  const location = useLocation();
  const navigate = useNavigate();
  const moduleLabel = t("menu.label");
  // `?subRun=` swaps the main panel for the monitor view; same host + thread binding.
  const subRunToolCallId = readCopilotSubRunToolCallId(location.search);
  const activeThreadId = binding.activeThreadId?.trim() ?? "";

  const subAgentDelegation = useMemo(
    () =>
      selectSubAgentDelegationFromMessages(
        host.copilotMessages,
        subRunToolCallId ?? ""
      ),
    [host.copilotMessages, subRunToolCallId]
  );

  const subRunLabels = useMemo(
    () => ({
      backToChat: t("subAgent.backToChat"),
      input: t("subAgent.input"),
      log: t("subAgent.log"),
      notFound: t("subAgent.notFound"),
      output: t("subAgent.output"),
      running: t("subAgent.running"),
    }),
    [t]
  );

  const handleSubRunBack = useCallback(() => {
    // Drop query only — transcript state stays on the shared copilot host.
    navigate(
      activeThreadId
        ? copilotChatThreadPath(activeThreadId)
        : copilotChatThreadPath("new")
    );
  }, [activeThreadId, navigate]);

  const breadcrumbs = useMemo((): PageBreadcrumb[] => {
    const trail: PageBreadcrumb[] = [
      {
        compactKept: true,
        label: (
          <span className="truncate font-medium text-foreground">
            {moduleLabel}
          </span>
        ),
        menuLabel: moduleLabel,
      },
    ];

    if (activeThreadId && thread.session) {
      const title = thread.session.title || tc("copilot.newChat");
      trail.push({
        compactKept: true,
        label: (
          <span
            className="max-w-[200px] truncate text-foreground"
            title={title}
          >
            {title}
          </span>
        ),
        menuLabel: title,
        to: subRunToolCallId
          ? copilotChatThreadPath(activeThreadId)
          : undefined,
      });
    } else if (!activeThreadId) {
      const title = tc("copilot.newChat");
      trail.push({
        compactKept: true,
        label: (
          <span
            className="max-w-[200px] truncate text-foreground"
            title={title}
          >
            {title}
          </span>
        ),
        menuLabel: title,
      });
    }

    if (subRunToolCallId && subAgentDelegation) {
      const agentName =
        subAgentDelegation.agentName || subAgentDelegation.agentId;
      trail.push({
        compactKept: true,
        label: (
          <span className="truncate text-muted-foreground" title={agentName}>
            {agentName}
          </span>
        ),
        menuLabel: agentName,
      });
    }

    return trail;
  }, [
    activeThreadId,
    moduleLabel,
    subAgentDelegation,
    subRunToolCallId,
    tc,
    thread.session,
  ]);
  const topbarActions = useMemo(() => <ChatTopbarActions />, []);
  const secondaryNavAfterItems = useMemo(() => <SessionList />, []);
  const secondaryNavHeaderSlot = useMemo(() => <ChatShellHeader />, []);

  usePageConfig({
    actions: topbarActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
    topbarChrome: "contentBlend",
  });

  useEffect(() => {
    const showEmptyLanding =
      status === "ready" && host.copilotMessages.length === 0 && !host.error;
    logCopilotChatPanel("render", {
      copilotMessageCount: host.copilotMessages.length,
      isLoadingSelectedSessionMessages,
      laneMessageCount: host.messages.length,
      selectedThreadId: binding.activeThreadId,
      selectedSessionMessagesError:
        selectedSessionMessagesError?.message ?? null,
      showEmptyLanding,
      status,
    });
  }, [
    binding.activeThreadId,
    host.copilotMessages.length,
    host.error,
    host.messages.length,
    isLoadingSelectedSessionMessages,
    selectedSessionMessagesError,
    status,
  ]);

  if (isSelectedSessionNotFound) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 px-page text-center">
        <p className="font-medium text-base">
          {t("chat.sessionNotFoundTitle")}
        </p>
        <p className="max-w-md text-muted-foreground text-sm">
          {t("chat.sessionNotFoundDescription")}
        </p>
        <button
          className="text-primary text-sm underline-offset-4 hover:underline"
          onClick={() => startNewChat()}
          type="button"
        >
          {tc("copilot.newChat")}
        </button>
      </div>
    );
  }

  return (
    <CopilotModuleErrorBoundary
      description={t("chat.moduleErrorDescription")}
      reloadLabel={t("chat.moduleErrorReload")}
      title={t("chat.moduleErrorTitle")}
    >
      <div
        className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent"
        key={host.threadResetKey}
      >
        {subRunToolCallId ? (
          <SubAgentRunFullPage
            labels={subRunLabels}
            messages={host.copilotMessages}
            onBack={handleSubRunBack}
            toolCallId={subRunToolCallId}
          />
        ) : (
          <ChatPanel />
        )}
      </div>
    </CopilotModuleErrorBoundary>
  );
}
