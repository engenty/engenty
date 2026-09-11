// Full-page chat is a dumb view over copilot host + binding hooks.
// The app-root provider owns threadId, transcript, navigation, and session
// list state; this page registers shell chrome and renders panels.

import { spaceKeyFromPathname } from "@engenty/ai-core/browser";
import {
  ENGENTY_COPILOT_HOST_KEY,
  type ObjectDisplayIntent,
  ObjectDisplayIntentProvider,
  openCopilotShell,
  openObjectPaneTab,
  SubAgentRunFullPage,
  selectSubAgentDelegationFromMessages,
  setCopilotComposerDraft,
  ThreadContextPane,
  useCopilotSelectedThread,
  useCopilotThreadActions,
  WorkspaceArtifactPane,
} from "@engenty/ai-ui";
import {
  ModuleSidebarHeaderLabel,
  useCopilotShellOrNull,
  useShellSecondaryNav,
} from "@engenty/app-shell";
import { useTranslation } from "@engenty/i18n/ui";
import { DockChatIcon } from "@engenty/ui-icons";
import {
  type PageBreadcrumb,
  usePageConfig,
  useWorkspaceContext,
} from "@engenty/ui-plugin-sdk";
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatPanel } from "../components/chat/chat-panel.js";
import { ChatTopbarActions } from "../components/chat/new-chat-action.js";
import { SpaceMismatchNotice } from "../components/chat/space-mismatch-notice.js";
import { CopilotModuleErrorBoundary } from "../components/copilot-module-error-boundary.js";
import { ThreadList } from "../components/thread-list/thread-list.js";
import { logCopilotChatPanel } from "../dev/chat-panel-debug.js";
import {
  COPILOT_CHAT_ROOT,
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
  const { secondaryNavOpen } = useShellSecondaryNav();
  /**
   * Outside a space this page owns the column: Copilot's name and its thread
   * list. Inside a space the space layout drills in (back arrow + this same
   * list), so the header stays the space's — only the thread list is ours, and
   * it is already space-filtered.
   *
   * Read from the PATHNAME, not from `currentSpace`: that one falls back to the
   * tenant default outside `/s/…` and so cannot answer "am I in a space at all".
   */
  const spaceKey = spaceKeyFromPathname(location.pathname);
  const inSpace = spaceKey != null;
  const copilotShell = useCopilotShellOrNull();
  // `?subRun=` swaps the main panel for the monitor view; same host + thread binding.
  const subRunToolCallId = readCopilotSubRunToolCallId(location.search);
  const activeThreadId = binding.activeThreadId?.trim() ?? "";
  // In a space, runs publish their artifacts SPACE-scoped (app-build-steps
  // publishes to `als.space`), so the pane must merge that scope or an app the
  // agent just built would not appear in the chat that built it.
  const { currentSpace } = useWorkspaceContext();
  const spaceArtifactScope = useMemo(
    () =>
      currentSpace ? { id: currentSpace.id, type: "space" as const } : null,
    [currentSpace]
  );

  // What object cards may do on this surface. Full-page chat owns a pane, so
  // records open beside the conversation rather than replacing it; and when a
  // link does leave for a module route, open the drawer first so the same
  // thread is still there on the other side (the drawer binds to the same
  // host key, and is suppressed on this route).
  const objectDisplayIntent = useMemo<ObjectDisplayIntent>(
    () => ({
      openInPanel: (ref, opts) =>
        openObjectPaneTab(ENGENTY_COPILOT_HOST_KEY, ref, {
          expanded: opts?.expanded,
          title: opts?.title,
        }),
      askAgent: (prompt) =>
        setCopilotComposerDraft(ENGENTY_COPILOT_HOST_KEY, prompt),
      applyDisplayHint: (refs, hint, opts) => {
        const first = refs[0];
        if (!first) {
          return;
        }
        openObjectPaneTab(ENGENTY_COPILOT_HOST_KEY, first, {
          expanded: hint === "expanded",
          title: opts?.title,
        });
      },
      navigateFromChat: (href) => {
        if (copilotShell) {
          // Same entry point the FAB uses — plain setOpen(true) leaves a
          // collapsed circle behind, since the persisted layout may still say
          // collapseToCircle.
          openCopilotShell({
            mergeLayout: copilotShell.copilotLayout.mergeLayout,
            preferredDockMode: copilotShell.preferredDockMode,
            setOpen: copilotShell.setOpen,
            setPreferredDockMode: copilotShell.setPreferredDockMode,
          });
        }
        navigate(href);
      },
    }),
    [copilotShell, navigate]
  );

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
    // When the session list is pinned, the module label lives in the sidebar
    // header — omit the matching topbar crumb (same pattern as projects/tasks).
    // Inside a space the sidebar no longer carries the module's name (the
    // column belongs to the space), so the topbar has to — the open column is
    // not a reason to drop the crumb there.
    const trail: PageBreadcrumb[] =
      secondaryNavOpen && !inSpace
        ? []
        : [
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
    inSpace,
    moduleLabel,
    secondaryNavOpen,
    subAgentDelegation,
    subRunToolCallId,
    tc,
    thread.session,
  ]);
  // Order: New Chat → context → artifacts → ⋯ menu (menu stays far right).
  const topbarActions = useMemo(() => <ChatTopbarActions />, []);
  const secondaryNavAfterItems = useMemo(() => <ThreadList />, []);
  const secondaryNavHeaderSlot = useMemo(
    () =>
      inSpace ? null : (
        <ModuleSidebarHeaderLabel
          icon={DockChatIcon}
          label={moduleLabel}
          to={COPILOT_CHAT_ROOT}
        />
      ),
    [inSpace, moduleLabel]
  );

  usePageConfig({
    actions: topbarActions,
    breadcrumbs,
    contentStackBackground: "paper",
    secondaryNavAfterItems,
    secondaryNavHeaderSlot,
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
      <ObjectDisplayIntentProvider value={objectDisplayIntent}>
        <ThreadContextPane
          hostKey={ENGENTY_COPILOT_HOST_KEY}
          key={host.threadResetKey}
        >
          {/* Above the transcript, not inside it: the mismatch is a fact about
              the whole conversation, and a note between messages would scroll
              away from the exact person who needs it. */}
          <SpaceMismatchNotice
            onContinueHere={() => startNewChat()}
            routeSpaceId={inSpace ? (currentSpace?.id ?? null) : null}
            threadSpaceId={thread.session?.space_id}
          />
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
        </ThreadContextPane>
        <WorkspaceArtifactPane
          extraScope={spaceArtifactScope}
          hostKey={ENGENTY_COPILOT_HOST_KEY}
        />
      </ObjectDisplayIntentProvider>
    </CopilotModuleErrorBoundary>
  );
}
